import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { CAPTURE_CONFIG, type CaptureConfig } from "./config.js";
import { dismissCookieBanner } from "./cookie-dismiss.js";
import { isSafeUrl } from "./url-safety.js";

export { CAPTURE_CONFIG } from "./config.js";

export interface CapturedSection {
  index: number;
  buffer: Buffer; // WebP buffer
  width: number;
  height: number;
  scrollY: number;
  newContentHeight: number; // Height in px that this frame adds
  isCropped?: boolean;
}

export type StopReason =
  | "page_end"
  | "consecutive_identical"
  | "safety_steps_limit"
  | "safety_time_limit";

export interface SectionCaptureResult {
  captureId: string;
  url: string;
  title: string;
  sections: CapturedSection[];
  totalStepsTaken: number;
  keptCount: number;
  droppedCount: number;
  stopReason: StopReason;
  stopReasonText: string | null;
  hitSafetyLimit: boolean;
  durationMs: number;
  documentHeightAtStart: number;
  documentHeightAtEnd: number;
}

export interface CaptureOptions {
  config?: Partial<CaptureConfig>;
  onProgress?: (message: string) => void;
}

/**
 * Generates a clean identifier for the capture session.
 */
function generateCaptureId(rawUrl: string): string {
  const urlObj = new URL(rawUrl);
  const hostSlug = urlObj.hostname
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${hostSlug || "site"}-${randomSuffix}`;
}

/**
 * Compares two downscaled grayscale image buffers across grid blocks.
 * Returns the maximum block average difference [0..1].
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
 * Fast check: waits briefly for uncompleted <img> tags visible in the viewport to decode.
 * NEVER waits on canvas, video, lottie, or looping animations.
 */
async function waitForViewportImages(page: Page, maxWaitMs: number): Promise<void> {
  await page
    .evaluate(
      (timeout) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, timeout);

          const images = Array.from(document.querySelectorAll("img"));
          const vh = window.innerHeight;
          const pendingImages = images.filter((img) => {
            if (img.complete) return false;
            const rect = img.getBoundingClientRect();
            return rect.bottom >= 0 && rect.top <= vh && rect.width > 0 && rect.height > 0;
          });

          if (pendingImages.length === 0) {
            clearTimeout(timer);
            resolve();
            return;
          }

          const decodes = pendingImages.map((img) => {
            if (typeof img.decode === "function") {
              return img.decode().catch(() => {});
            }
            return new Promise<void>((imgResolve) => {
              img.addEventListener("load", () => imgResolve(), { once: true });
              img.addEventListener("error", () => imgResolve(), { once: true });
            });
          });

          Promise.all(decodes).then(() => {
            clearTimeout(timer);
            resolve();
          });
        }),
      maxWaitMs
    )
    .catch(() => {});
}

/**
 * Fast settle check: waits for document scroll position to become stationary.
 */
async function waitForScrollSettle(page: Page, maxWaitMs: number): Promise<void> {
  const startTime = Date.now();
  let prevScrollY = -1;

  while (Date.now() - startTime < maxWaitMs) {
    const currentY = await page
      .evaluate(() => window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0)
      .catch(() => null);

    if (currentY === null) break;

    if (prevScrollY !== -1 && Math.abs(currentY - prevScrollY) < 2) {
      break;
    }

    prevScrollY = currentY;
    await page.waitForTimeout(80).catch(() => {});
  }
}

/**
 * Executes section-by-section auto-capture with distance-based end-of-page rules and fast step timing.
 */
export async function captureSections(
  inputUrl: string,
  options?: CaptureOptions
): Promise<SectionCaptureResult> {
  const check = isSafeUrl(inputUrl);
  if (!check.safe || !check.url) {
    throw new Error(check.reason || "Invalid or unsafe URL.");
  }
  const targetUrl = check.url.toString();

  const cfg = { ...CAPTURE_CONFIG, ...options?.config };
  const notify = options?.onProgress || (() => {});
  const startTime = Date.now();
  const captureId = generateCaptureId(targetUrl);

  let browser: Browser | null = null;
  const sections: CapturedSection[] = [];
  let previousKeptPngBuffer: Buffer | null = null;
  let droppedCount = 0;
  let totalStepsTaken = 0;
  let consecutiveIdenticalCount = 0;
  let stopReason: StopReason = "page_end";
  let pageTitle = "";
  let documentHeightAtStart = 0;
  let documentHeightAtEnd = 0;
  let documentHeightGrew = false;
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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 TasteCapture/2.0",
      deviceScaleFactor: 1,
    });

    const page: Page = await context.newPage();

    notify(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: cfg.NAVIGATION_TIMEOUT_MS,
    });

    notify("Waiting for initial network activity to settle...");
    await page.waitForLoadState("networkidle", {
      timeout: cfg.NETWORK_IDLE_TIMEOUT_MS,
    }).catch(() => {});

    pageTitle = (await page.title()) || targetUrl;

    notify("Checking for cookie/consent banners...");
    await dismissCookieBanner(page).catch(() => {});

    // Ensure page starts at top
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(200);

    // Initial metrics
    const initialMetrics = await page.evaluate(() => ({
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      clientHeight: window.innerHeight,
    }));
    documentHeightAtStart = initialMetrics.scrollHeight;

    // Center mouse cursor for wheel events
    await page.mouse.move(cfg.VIEWPORT.width / 2, cfg.VIEWPORT.height / 2);

    let currentScrollY = 0;

    while (true) {
      totalStepsTaken++;

      // 1. Safety limit checks
      if (totalStepsTaken > cfg.SAFETY_LIMITS.MAX_TOTAL_STEPS) {
        stopReason = "safety_steps_limit";
        notify(`Safety step limit reached (${cfg.SAFETY_LIMITS.MAX_TOTAL_STEPS} steps).`);
        break;
      }

      if (Date.now() - startTime > cfg.SAFETY_LIMITS.MAX_CAPTURE_TIME_MS) {
        stopReason = "safety_time_limit";
        notify(`Safety time limit reached (${cfg.SAFETY_LIMITS.MAX_CAPTURE_TIME_MS / 1000}s).`);
        break;
      }

      // 2. Fast settle checks (capped budget per step)
      const stepWaitStart = Date.now();
      await waitForViewportImages(page, cfg.IMAGE_DECODE_MAX_WAIT_MS);
      await waitForScrollSettle(page, cfg.SETTLE_MAX_WAIT_MS);

      currentScrollY = await page.evaluate(
        () => window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
      );

      if (currentScrollY > maxScrollY) {
        maxScrollY = currentScrollY;
      }

      const docMetrics = await page.evaluate(() => ({
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        clientHeight: window.innerHeight,
      }));

      if (docMetrics.scrollHeight > documentHeightAtStart + 1500) {
        documentHeightGrew = true;
      }

      // 3. Take viewport screenshot
      const currentPngBuffer = await page.screenshot({ fullPage: false });

      // 4. Distinct check
      const documentActuallyScrolls = maxScrollY > 50;
      let isDistinct = true;

      // On scroll-locked/virtual-scroll sites where scrollY stays 0, use pixel block diff
      if (!documentActuallyScrolls && previousKeptPngBuffer !== null) {
        const diff = await computeMaxBlockDifference(
          currentPngBuffer,
          previousKeptPngBuffer,
          cfg.DEDUPLICATION.THUMB_WIDTH,
          cfg.DEDUPLICATION.THUMB_HEIGHT,
          cfg.DEDUPLICATION.BLOCK_SIZE_X,
          cfg.DEDUPLICATION.BLOCK_SIZE_Y
        );

        if (diff < cfg.DEDUPLICATION.DIFF_THRESHOLD) {
          isDistinct = false;
        }
      }

      if (isDistinct) {
        consecutiveIdenticalCount = 0;
        previousKeptPngBuffer = currentPngBuffer;

        const webpBuffer = await sharp(currentPngBuffer)
          .webp({ quality: cfg.IMAGE_FORMAT.QUALITY, effort: cfg.IMAGE_FORMAT.EFFORT })
          .toBuffer();

        const sectionIndex = sections.length + 1;
        sections.push({
          index: sectionIndex,
          buffer: webpBuffer,
          width: cfg.VIEWPORT.width,
          height: cfg.VIEWPORT.height,
          scrollY: Math.round(currentScrollY),
          newContentHeight: cfg.VIEWPORT.height,
        });

        notify(`Captured section ${sectionIndex} (scrollY: ${Math.round(currentScrollY)}px, adds ${cfg.VIEWPORT.height}px)`);
      } else {
        droppedCount++;
        consecutiveIdenticalCount++;
        notify(
          `Skipped identical frame (identical streak: ${consecutiveIdenticalCount}/${cfg.CONSECUTIVE_IDENTICAL_LIMIT})`
        );

        if (consecutiveIdenticalCount >= cfg.CONSECUTIVE_IDENTICAL_LIMIT) {
          stopReason = "consecutive_identical";
          notify(`Page stopped changing after ${cfg.CONSECUTIVE_IDENTICAL_LIMIT} identical steps.`);
          break;
        }
      }

      // 5. Check end-of-page rule using scroll distance
      const remainingDocContent = docMetrics.scrollHeight - (currentScrollY + cfg.VIEWPORT.height);

      if (remainingDocContent < cfg.NEW_CONTENT_MIN_PX) {
        // Less than 150px remaining: stop. Capture nothing more.
        stopReason = "page_end";
        notify(`Page end reached (only ${Math.round(remainingDocContent)}px remaining < ${cfg.NEW_CONTENT_MIN_PX}px threshold).`);
        break;
      }

      if (remainingDocContent < cfg.VIEWPORT.height) {
        // Between 150px and 899px remaining: clamped final bottom scroll
        const newContentHeight = Math.round(remainingDocContent);
        notify(
          `Final bottom scroll: ${newContentHeight}px new content remaining (>= ${cfg.NEW_CONTENT_MIN_PX}px). Capturing cropped bottom frame...`
        );

        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
        await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);
        await waitForViewportImages(page, cfg.IMAGE_DECODE_MAX_WAIT_MS);

        const bottomPngBuffer = await page.screenshot({ fullPage: false });

        // Crop to only the new region (the bottom part of that screenshot)
        const cropTop = cfg.VIEWPORT.height - newContentHeight;
        const croppedWebpBuffer = await sharp(bottomPngBuffer)
          .extract({
            left: 0,
            top: cropTop,
            width: cfg.VIEWPORT.width,
            height: newContentHeight,
          })
          .webp({ quality: cfg.IMAGE_FORMAT.QUALITY, effort: cfg.IMAGE_FORMAT.EFFORT })
          .toBuffer();

        const sectionIndex = sections.length + 1;
        sections.push({
          index: sectionIndex,
          buffer: croppedWebpBuffer,
          width: cfg.VIEWPORT.width,
          height: newContentHeight,
          scrollY: Math.round(docMetrics.scrollHeight - newContentHeight),
          newContentHeight: newContentHeight,
          isCropped: true,
        });

        notify(`Captured final bottom section ${sectionIndex} (cropped to ${newContentHeight}px, zero duplicate content).`);
        stopReason = "page_end";
        break;
      }

      // 6. Scroll down by one viewport step
      const stepRemainingWait = Math.max(0, cfg.MAX_STEP_WAIT_MS - (Date.now() - stepWaitStart));
      const pauseDuration = Math.min(cfg.PAUSE_PER_STEP_MS, stepRemainingWait);

      await page.mouse.wheel(0, cfg.SCROLL_STEP_PX);
      await page.waitForTimeout(pauseDuration);

      const afterScrollY = await page.evaluate(
        () => window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
      );

      // Fallback scroll if mouse wheel did not scroll the window
      if (Math.abs(afterScrollY - currentScrollY) < 2) {
        await page.evaluate((stepPx) => window.scrollBy(0, stepPx), cfg.SCROLL_STEP_PX);
        await page.waitForTimeout(200);
      }
    }

    // Measure final document height
    const finalMetrics = await page.evaluate(() => ({
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    }));
    documentHeightAtEnd = finalMetrics.scrollHeight;

    // Format stop reason text
    let stopReasonText: string | null = null;
    if (stopReason === "safety_steps_limit" || stopReason === "safety_time_limit") {
      if (documentHeightGrew) {
        stopReasonText = `Stopped early after ${sections.length} sections to avoid an endless page`;
      } else {
        stopReasonText = `Stopped early after ${sections.length} sections; the page continued.`;
      }
    }

    notify(`Auto-capture finished: ${sections.length} kept, ${droppedCount} dropped. Reason: ${stopReason}`);

    return {
      captureId,
      url: targetUrl,
      title: pageTitle,
      sections,
      totalStepsTaken,
      keptCount: sections.length,
      droppedCount,
      stopReason,
      stopReasonText,
      hitSafetyLimit: stopReason === "safety_steps_limit" || stopReason === "safety_time_limit",
      durationMs: Date.now() - startTime,
      documentHeightAtStart,
      documentHeightAtEnd,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
