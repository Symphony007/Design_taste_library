import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CAPTURE_CONFIG, type CaptureConfig } from "./config.js";
import { dismissCookieBanner } from "./cookie-dismiss.js";

export { CAPTURE_CONFIG } from "./config.js";

export interface CaptureOptions {
  config?: Partial<CaptureConfig>;
  targetDir?: string;
  onProgress?: (message: string) => void;
}

export interface CaptureResult {
  captureId: string;
  url: string;
  title: string;
  fullPagePath: string;
  thumbnailPath: string;
  capturePathUsed: "native" | "stitched";
  contentCheck: {
    testedRegions: number;
    mismatchedRegions: number;
    passed: boolean;
  };
  framesKept?: number;
  framesDropped?: number;
  totalHeight: number;
  isCapped: boolean;
  capturedAt: string;
}

interface StepFrame {
  index: number;
  scrollY: number;
  buffer: Buffer;
}

/**
 * Generates a clean, filesystem-safe capture ID based on timestamp and target domain.
 */
function generateCaptureId(rawUrl: string): string {
  const urlObj = new URL(rawUrl);
  const hostSlug = urlObj.hostname
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHmmss
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${hostSlug || "site"}-${randomSuffix}`;
}

/**
 * Validates the URL string. Throws descriptive error if invalid.
 */
function validateUrl(inputUrl: string): string {
  const trimmed = inputUrl.trim();
  if (!trimmed) {
    throw new Error("URL cannot be empty.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL format: "${trimmed}". Please provide a full URL with http:// or https://`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol "${parsed.protocol}". URL must start with http:// or https://`);
  }
  return parsed.toString();
}

/**
 * Compares two image buffers downscaled to grayscale, calculating the maximum block difference.
 */
async function computeMaxBlockDifference(
  bufA: Buffer,
  bufB: Buffer,
  width: number,
  height: number,
  blockSizeX: number,
  blockSizeY: number
): Promise<number> {
  const [rawA, rawB] = await Promise.all([
    sharp(bufA).resize(width, height, { fit: "fill" }).grayscale().raw().toBuffer(),
    sharp(bufB).resize(width, height, { fit: "fill" }).grayscale().raw().toBuffer(),
  ]);

  const numBlocksX = Math.floor(width / blockSizeX);
  const numBlocksY = Math.floor(height / blockSizeY);
  let maxBlockDiff = 0;

  for (let by = 0; by < numBlocksY; by++) {
    for (let bx = 0; bx < numBlocksX; bx++) {
      let blockSum = 0;
      let count = 0;

      for (let y = by * blockSizeY; y < (by + 1) * blockSizeY; y++) {
        for (let x = bx * blockSizeX; x < (bx + 1) * blockSizeX; x++) {
          const idx = y * width + x;
          blockSum += Math.abs(rawA[idx] - rawB[idx]);
          count++;
        }
      }

      const blockAvgDiff = count > 0 ? blockSum / (count * 255) : 0;
      if (blockAvgDiff > maxBlockDiff) {
        maxBlockDiff = blockAvgDiff;
      }
    }
  }

  return maxBlockDiff;
}

/**
 * Compares a step frame against the corresponding region extracted from the native full-page capture.
 * Returns the mean normalized pixel difference [0..1].
 */
async function compareRegionDifference(
  stepBuffer: Buffer,
  nativeBuffer: Buffer,
  regionTop: number,
  viewportWidth: number,
  viewportHeight: number,
  nativeTotalHeight: number,
  thumbWidth: number,
  thumbHeight: number
): Promise<number> {
  const safeTop = Math.max(0, Math.min(regionTop, nativeTotalHeight - viewportHeight));
  const safeHeight = Math.min(viewportHeight, nativeTotalHeight - safeTop);

  if (safeHeight <= 10) {
    return 1.0; // Out of bounds region considered completely different
  }

  try {
    const nativeRegion = await sharp(nativeBuffer)
      .extract({ left: 0, top: safeTop, width: viewportWidth, height: safeHeight })
      .resize(thumbWidth, thumbHeight, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();

    const stepThumb = await sharp(stepBuffer)
      .resize(thumbWidth, thumbHeight, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();

    let sumDiff = 0;
    const totalPixels = thumbWidth * thumbHeight;
    for (let i = 0; i < totalPixels; i++) {
      sumDiff += Math.abs(nativeRegion[i] - stepThumb[i]);
    }

    return sumDiff / (totalPixels * 255);
  } catch {
    return 1.0;
  }
}

/**
 * Captures a website into exactly one reliable full-page screenshot and a card thumbnail.
 */
export async function captureUrl(
  inputUrl: string,
  options?: CaptureOptions
): Promise<CaptureResult> {
  const targetUrl = validateUrl(inputUrl);
  const cfg = { ...CAPTURE_CONFIG, ...options?.config };
  const notify = options?.onProgress || (() => {});

  const captureId = generateCaptureId(targetUrl);
  const captureDir =
    options?.targetDir || path.resolve(process.cwd(), cfg.OUTPUT_DIR, captureId);
  const fullPagePath = path.resolve(captureDir, "full.png");
  const thumbnailPath = path.resolve(captureDir, "thumb.png");

  // Ensure output directory exists
  fs.mkdirSync(captureDir, { recursive: true });

  let browser: Browser | null = null;
  const stepFrames: StepFrame[] = [];
  let isCapped = false;
  let totalHeight = 0;
  let pageTitle = "";
  let maxScrollY = 0;

  try {
    notify(`Launching headless Chromium (${cfg.VIEWPORT.width}x${cfg.VIEWPORT.height})...`);
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    });

    const context = await browser.newContext({
      viewport: cfg.VIEWPORT,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 TasteCapture/1.0",
      deviceScaleFactor: 1,
    });

    const page: Page = await context.newPage();

    notify(`Navigating to ${targetUrl}...`);
    try {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: cfg.NAVIGATION_TIMEOUT_MS,
      });
    } catch (navErr: any) {
      throw new Error(`Failed to load page: ${navErr.message || navErr}`);
    }

    notify("Waiting for initial network activity to settle...");
    await page.waitForLoadState("networkidle", {
      timeout: cfg.NETWORK_IDLE_TIMEOUT_MS,
    }).catch(() => {
      // Common on sites with persistent websockets/telemetry
    });

    pageTitle = (await page.title()) || targetUrl;

    notify("Checking for cookie/consent banners to dismiss...");
    await dismissCookieBanner(page).catch(() => {});

    // Measure initial document metrics
    const initialMetrics = await page.evaluate(() => ({
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      clientHeight: window.innerHeight,
    }));
    totalHeight = initialMetrics.scrollHeight;

    notify(`Page loaded: "${pageTitle}" (initial measured height: ${totalHeight}px)`);

    // Ensure page begins at absolute top
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(300);

    // Position mouse cursor in center of viewport so mouse.wheel targets scrollable area
    await page.mouse.move(cfg.VIEWPORT.width / 2, cfg.VIEWPORT.height / 2);

    let stepIndex = 1;
    let reachedBottom = false;

    notify("Running step-scroll to trigger lazy content and scroll effects...");

    while (!reachedBottom) {
      // CRITICAL: Read scrollY after pause so smooth-scroll libraries (Lenis, GSAP, etc.) have caught up with the wheel
      const currentScrollY = await page.evaluate(
        () => window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
      );

      if (currentScrollY > maxScrollY) {
        maxScrollY = currentScrollY;
      }

      // Capture viewport frame into buffer
      const frameBuffer = await page.screenshot({ fullPage: false });
      stepFrames.push({
        index: stepIndex,
        scrollY: currentScrollY,
        buffer: frameBuffer,
      });

      notify(`Captured step ${stepIndex} at scrollY: ${Math.round(currentScrollY)}px`);

      // If document is scrolling (maxScrollY > 50px), hide fixed & sticky elements after frame 1 so headers don't repeat
      if (maxScrollY > cfg.NATIVE_TRUST.SCROLL_DETECT_THRESHOLD_PX && stepIndex === 1) {
        await page.evaluate(() => {
          document.querySelectorAll("*").forEach((el) => {
            const pos = window.getComputedStyle(el).position;
            if (pos === "fixed" || pos === "sticky") {
              el.setAttribute("data-capture-hidden", "true");
              (el as HTMLElement).style.setProperty("visibility", "hidden", "important");
            }
          });
        });
      }

      // Check height limit against stitched cap
      if (currentScrollY + cfg.VIEWPORT.height >= cfg.MAX_STITCHED_PAGE_HEIGHT_PX) {
        isCapped = true;
        console.log(`Stepping reached maximum stitched page height limit (${cfg.MAX_STITCHED_PAGE_HEIGHT_PX}px).`);
        notify(`Page height cap reached (${cfg.MAX_STITCHED_PAGE_HEIGHT_PX}px limit).`);
        break;
      }

      const metrics = await page.evaluate(() => ({
        scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        clientHeight: window.innerHeight,
      }));
      totalHeight = metrics.scrollHeight;

      if (metrics.scrollY + metrics.clientHeight >= metrics.scrollHeight - 5) {
        reachedBottom = true;
        break;
      }

      // Scroll down by one step with real mouse wheel
      await page.mouse.wheel(0, cfg.SCROLL_STEP_PX);
      // Wait for animations and smooth-scroll to settle
      await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);

      const afterScrollY = await page.evaluate(
        () => window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
      );

      // Fallback scroll if wheel did not move document scrollY
      if (Math.abs(afterScrollY - currentScrollY) < 2) {
        await page.evaluate((stepPx) => window.scrollBy(0, stepPx), cfg.SCROLL_STEP_PX);
        await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);
      }

      const finalMetrics = await page.evaluate(() => ({
        scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        clientHeight: window.innerHeight,
      }));

      if (
        Math.abs(finalMetrics.scrollY - currentScrollY) < 2 ||
        finalMetrics.scrollY + finalMetrics.clientHeight >= finalMetrics.scrollHeight - 5
      ) {
        reachedBottom = true;
      }

      totalHeight = finalMetrics.scrollHeight;
      stepIndex++;

      const maxSteps = Math.ceil(cfg.MAX_STITCHED_PAGE_HEIGHT_PX / cfg.SCROLL_STEP_PX) + 2;
      if (stepIndex > maxSteps) {
        isCapped = true;
        console.log(`Stepping guardrail reached (${maxSteps} steps limit).`);
        break;
      }
    }

    notify(`Completed step sequence (${stepFrames.length} steps taken). Restoring page state...`);

    // Restore any hidden fixed/sticky elements
    await page.evaluate(() => {
      document.querySelectorAll('[data-capture-hidden="true"]').forEach((el) => {
        el.removeAttribute("data-capture-hidden");
        (el as HTMLElement).style.removeProperty("visibility");
      });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.mouse.wheel(0, -999999);
    await page.waitForTimeout(cfg.SETTLE_DELAY_MS);

    // Measure final document scrollHeight
    const finalMetrics = await page.evaluate(() => ({
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    }));
    totalHeight = finalMetrics.scrollHeight;

    notify(`Attempting native full-page screenshot (measured document height: ${totalHeight}px)...`);

    let nativeBuffer: Buffer;
    if (totalHeight > cfg.MAX_PAGE_HEIGHT_PX) {
      isCapped = true;
      notify(`Clamping native capture to Chromium limit (${cfg.MAX_PAGE_HEIGHT_PX}px).`);
      nativeBuffer = await page.screenshot({
        clip: {
          x: 0,
          y: 0,
          width: cfg.VIEWPORT.width,
          height: cfg.MAX_PAGE_HEIGHT_PX,
        },
      });
    } else {
      nativeBuffer = await page.screenshot({ fullPage: true });
    }

    const nativeMeta = await sharp(nativeBuffer).metadata();
    const nativeWidth = nativeMeta.width || cfg.VIEWPORT.width;
    const nativeHeight = nativeMeta.height || cfg.VIEWPORT.height;

    notify(`Native screenshot taken: ${nativeWidth}x${nativeHeight}px`);

    // -------------------------------------------------------------
    // DECISION: Is the native full-page capture trustworthy?
    // -------------------------------------------------------------
    const documentActuallyScrolls = maxScrollY > cfg.NATIVE_TRUST.SCROLL_DETECT_THRESHOLD_PX;
    const isSingleViewport = stepFrames.length <= 1;

    // (a) Document actually scrolls or page is a single viewport
    const passesScrollCheck = documentActuallyScrolls || isSingleViewport;

    // (b) Native height is at least MIN_DOC_HEIGHT_RATIO of measured document height
    const heightRatio = nativeHeight / Math.max(1, totalHeight);
    const passesHeightCheck = heightRatio >= cfg.NATIVE_TRUST.MIN_DOC_HEIGHT_RATIO;

    // (c) Coarse content check: compare step frames with corresponding regions in native image
    let mismatchedRegions = 0;
    const testedRegions = stepFrames.length;

    for (const step of stepFrames) {
      const diff = await compareRegionDifference(
        step.buffer,
        nativeBuffer,
        step.scrollY,
        cfg.VIEWPORT.width,
        cfg.VIEWPORT.height,
        nativeHeight,
        cfg.STITCHING.FRAME_THUMBNAIL_WIDTH,
        cfg.STITCHING.FRAME_THUMBNAIL_HEIGHT
      );

      if (diff > cfg.NATIVE_TRUST.STEP_REGION_MAX_DIFF) {
        mismatchedRegions++;
      }
    }

    const mismatchRatio = testedRegions > 0 ? mismatchedRegions / testedRegions : 0;
    const passesContentCheck = mismatchRatio <= cfg.NATIVE_TRUST.MAX_MISMATCHED_REGIONS_RATIO;

    const contentCheckSummary = {
      testedRegions,
      mismatchedRegions,
      passed: passesContentCheck,
    };

    notify(
      `Trust evaluation: scrolls=${passesScrollCheck} (maxScrollY: ${Math.round(maxScrollY)}px), ` +
      `heightRatio=${heightRatio.toFixed(2)} (passes: ${passesHeightCheck}), ` +
      `contentCheck=${passesContentCheck} (${mismatchedRegions}/${testedRegions} mismatched)`
    );

    let capturePathUsed: "native" | "stitched";
    let finalFullPageBuffer: Buffer;
    let framesKeptCount: number | undefined;
    let framesDroppedCount: number | undefined;

    if (passesScrollCheck && passesHeightCheck && passesContentCheck) {
      capturePathUsed = "native";
      finalFullPageBuffer = nativeBuffer;
      notify(`Native full-page capture verified and selected (${nativeHeight}px).`);
    } else {
      capturePathUsed = "stitched";
      notify(`Native capture untrusted. Routing to Sharp stitching engine...`);

      if (documentActuallyScrolls) {
        // Mode A: Document actually scrolled - composite at recorded scroll offsets
        notify("Stitching scrolling document based on recorded scroll offsets...");
        const canvasHeight = Math.min(
          Math.max(Math.round(maxScrollY + cfg.VIEWPORT.height), nativeHeight),
          cfg.MAX_STITCHED_PAGE_HEIGHT_PX
        );

        if (canvasHeight >= cfg.MAX_STITCHED_PAGE_HEIGHT_PX) {
          isCapped = true;
          console.log(`Page height cap applied: ${cfg.MAX_STITCHED_PAGE_HEIGHT_PX}px limit.`);
          notify(`Page height cap applied: ${cfg.MAX_STITCHED_PAGE_HEIGHT_PX}px limit.`);
        }

        const compositeInputs = stepFrames.map((frame) => ({
          input: frame.buffer,
          top: Math.min(Math.round(frame.scrollY), canvasHeight - cfg.VIEWPORT.height),
          left: 0,
        }));

        finalFullPageBuffer = await sharp({
          create: {
            width: cfg.VIEWPORT.width,
            height: canvasHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        })
          .composite(compositeInputs)
          .png()
          .toBuffer();

        totalHeight = canvasHeight;
        framesKeptCount = stepFrames.length;
        framesDroppedCount = 0;
      } else {
        // Mode B: Scroll-locked / Virtual scroll site (maxScrollY <= 10px) - stack frames vertically
        notify("Stitching scroll-locked site: evaluating frame differences with block comparison...");
        const uniqueFrames: StepFrame[] = [];
        let droppedCount = 0;

        for (let i = 0; i < stepFrames.length; i++) {
          const current = stepFrames[i];
          if (uniqueFrames.length === 0) {
            uniqueFrames.push(current);
            continue;
          }

          const previous = uniqueFrames[uniqueFrames.length - 1];
          const maxBlockDiff = await computeMaxBlockDifference(
            current.buffer,
            previous.buffer,
            cfg.STITCHING.FRAME_THUMBNAIL_WIDTH,
            cfg.STITCHING.FRAME_THUMBNAIL_HEIGHT,
            cfg.STITCHING.BLOCK_SIZE_X,
            cfg.STITCHING.BLOCK_SIZE_Y
          );

          if (maxBlockDiff >= cfg.STITCHING.MAX_BLOCK_DIFF_THRESHOLD) {
            uniqueFrames.push(current);
          } else {
            droppedCount++;
          }
        }

        framesKeptCount = uniqueFrames.length;
        framesDroppedCount = droppedCount;
        notify(
          `Duplicate frame filter: ${framesKeptCount} distinct states kept, ${framesDroppedCount} static frames dropped.`
        );

        let canvasHeight = uniqueFrames.length * cfg.VIEWPORT.height;
        if (canvasHeight > cfg.MAX_STITCHED_PAGE_HEIGHT_PX) {
          isCapped = true;
          console.log(`Page height cap applied: ${cfg.MAX_STITCHED_PAGE_HEIGHT_PX}px limit.`);
          notify(`Page height cap applied: ${cfg.MAX_STITCHED_PAGE_HEIGHT_PX}px limit.`);
          canvasHeight = cfg.MAX_STITCHED_PAGE_HEIGHT_PX;
        }

        const compositeInputs = uniqueFrames
          .map((frame, idx) => ({
            input: frame.buffer,
            top: idx * cfg.VIEWPORT.height,
            left: 0,
          }))
          .filter((item) => item.top < canvasHeight);

        finalFullPageBuffer = await sharp({
          create: {
            width: cfg.VIEWPORT.width,
            height: canvasHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        })
          .composite(compositeInputs)
          .png()
          .toBuffer();

        totalHeight = canvasHeight;
      }
    }

    // Write final full-page image
    fs.writeFileSync(fullPagePath, finalFullPageBuffer);
    notify(`Saved final full-page image: ${fullPagePath} (${totalHeight}px)`);

    // Generate small card thumbnail (top crop)
    const finalMeta = await sharp(finalFullPageBuffer).metadata();
    const finalWidth = finalMeta.width || cfg.VIEWPORT.width;
    const finalHeight = finalMeta.height || totalHeight;

    const cropHeight = Math.min(finalHeight, Math.round((finalWidth * cfg.STITCHING.THUMBNAIL_HEIGHT) / cfg.STITCHING.THUMBNAIL_WIDTH));

    await sharp(finalFullPageBuffer)
      .extract({ left: 0, top: 0, width: finalWidth, height: cropHeight })
      .resize(cfg.STITCHING.THUMBNAIL_WIDTH, cfg.STITCHING.THUMBNAIL_HEIGHT, { fit: "cover", position: "top" })
      .jpeg({ quality: 85 })
      .toFile(thumbnailPath);

    notify(`Saved card thumbnail: ${thumbnailPath}`);

    return {
      captureId,
      url: targetUrl,
      title: pageTitle,
      fullPagePath,
      thumbnailPath,
      capturePathUsed,
      contentCheck: contentCheckSummary,
      framesKept: framesKeptCount,
      framesDropped: framesDroppedCount,
      totalHeight,
      isCapped,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
