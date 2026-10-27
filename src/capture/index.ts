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
 * Detects if a full-screen preloader/splash screen is active (common on WebGL, 3D, and Awwwards sites).
 * Waits adaptively for it to complete/dismiss, handles interactive "Enter" buttons, and allows
 * canvas/entrance animations to settle.
 */
async function waitForPreloaderDismissal(
  page: Page,
  notify: (msg: string) => void,
  maxWaitMs: number,
  settleMs: number
): Promise<void> {
  // Give scripts a brief moment (~800ms) to attach any preloader to the DOM if not already present
  await page.waitForTimeout(800).catch(() => {});

  const detection = await page
    .evaluate(() => {
      const loaderSelectors = [
        ".preloader",
        ".js-preloader",
        "#preloader",
        "#loader",
        ".loader",
        "[class*='preloader']",
        "[id*='preloader']",
        "[class*='loading-screen']",
        "[class*='loading-overlay']",
        "[class*='splash-screen']",
        "[class*='splash']",
        "[data-loading]",
        "[aria-label*='loading' i]",
      ];

      for (const sel of loaderSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const isBig =
            rect.width >= window.innerWidth * 0.4 && rect.height >= window.innerHeight * 0.4;
          const isVisible =
            style.display !== "none" && style.opacity !== "0" && style.visibility !== "hidden";
          if (isBig && isVisible) {
            const rawText = (el.textContent || "").slice(0, 80).replace(/\s+/g, " ").trim();
            return { found: true, selector: sel, text: rawText };
          }
        }
      }

      // Check for large elements containing percentage/loading text
      const allDivs = Array.from(document.querySelectorAll("div, section, main"));
      for (const el of allDivs) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const isFullScreen =
          rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8;
        const isVisible =
          style.display !== "none" && style.opacity !== "0" && style.visibility !== "hidden";
        if (
          isFullScreen &&
          isVisible &&
          (style.position === "fixed" || style.position === "absolute")
        ) {
          const txt = (el.textContent || "").trim();
          if (/\b\d{1,3}%\b/i.test(txt) && /load|experience|please wait|preparing/i.test(txt)) {
            return { found: true, selector: null, text: txt.slice(0, 60) };
          }
        }
      }

      return { found: false, selector: null, text: "" };
    })
    .catch(() => ({ found: false, selector: null, text: "" }));

  if (!detection.found) {
    return;
  }

  notify(
    `Detected preloader/splash screen${detection.text ? ` ("${detection.text}")` : ""}. Waiting for experience to load...`
  );

  const startTime = Date.now();
  let lastProgressReport = startTime;

  while (Date.now() - startTime < maxWaitMs) {
    await page.waitForTimeout(600).catch(() => {});

    const status = await page
      .evaluate((targetSelector) => {
        if (targetSelector) {
          const el = document.querySelector(targetSelector);
          if (!el) return { isGone: true, progressText: "" };
          const style = window.getComputedStyle(el);
          if (
            style.display === "none" ||
            style.opacity === "0" ||
            style.visibility === "hidden"
          ) {
            return { isGone: true, progressText: "" };
          }
          return {
            isGone: false,
            progressText: (el.textContent || "").slice(0, 60).replace(/\s+/g, " ").trim(),
          };
        }

        const fullOverlays = Array.from(document.querySelectorAll("div, section")).filter((el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const isBig =
            rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8;
          const isVisible =
            style.display !== "none" && style.opacity !== "0" && style.visibility !== "hidden";
          if (isBig && isVisible && (style.position === "fixed" || style.position === "absolute")) {
            const txt = (el.textContent || "").trim();
            return /\b\d{1,3}%\b/i.test(txt) || /loading your experience|please wait/i.test(txt);
          }
          return false;
        });

        return {
          isGone: fullOverlays.length === 0,
          progressText: fullOverlays[0]
            ? (fullOverlays[0].textContent || "").slice(0, 60).replace(/\s+/g, " ").trim()
            : "",
        };
      }, detection.selector)
      .catch(() => ({ isGone: true, progressText: "" }));

    if (status.isGone) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      notify(`Preloader dismissed after ${durationSec}s.`);
      break;
    }

    if (Date.now() - lastProgressReport > 3000) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      notify(
        `Still loading (${elapsed}s elapsed)${status.progressText ? `: ${status.progressText}` : "..."}`
      );
      lastProgressReport = Date.now();
    }
  }

  // Check for interactive "Enter" / "Start" buttons (common in WebGL/audio experiences)
  await page
    .evaluate(() => {
      const enterButtons = Array.from(document.querySelectorAll("button, a, [role='button']"));
      const enterTarget = enterButtons.find((b) => {
        const text = (b.textContent || "").trim().toLowerCase();
        const isVisible =
          window.getComputedStyle(b).display !== "none" &&
          window.getComputedStyle(b).visibility !== "hidden";
        return isVisible && /^(enter|click to enter|start|explore|begin|experience|enter site)$/i.test(text);
      });
      if (enterTarget) {
        (enterTarget as HTMLElement).click();
      }
    })
    .catch(() => {});

  if (settleMs > 0) {
    notify(`Waiting ${Math.round(settleMs / 1000)}s for canvas and entrance animations to render...`);
    await page.waitForTimeout(settleMs).catch(() => {});
  }
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
  let droppedCount = 0;
  let totalStepsTaken = 0;
  let stopReason: StopReason = "page_end";
  let pageTitle = "";
  let documentHeightAtStart = 0;
  let documentHeightAtEnd = 0;
  let documentHeightGrew = false;
  let maxScrollY = 0;

  try {
    const launchArgs = [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--enable-gpu-rasterization",
    ];

    if (process.platform === "win32") {
      launchArgs.push("--use-gl=angle", "--use-angle=d3d11");
    }

    browser = await chromium.launch({
      headless: true,
      args: launchArgs,
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

    // Intelligent check for preloaders / splash screens (WebGL, 3D, immersive sites)
    notify("Checking for preloader / splash screens...");
    await waitForPreloaderDismissal(page, notify, cfg.PRELOADER_MAX_WAIT_MS, cfg.PRELOADER_SETTLE_MS);

    // Re-check cookie banners in case one appeared after the splash screen cleared
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

    let fullPngBuffer: Buffer;
    const isDocScrollable = initialMetrics.scrollHeight > initialMetrics.clientHeight + 150;

    if (isDocScrollable) {
      // Branch A: Standard scrollable HTML document
      let currentScrollY = 0;
      let consecutiveUnchangedCount = 0;

      notify("Performing rolling scroll pass to trigger lazy-loaded media and animations...");

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

        // 2. Fast settle checks
        await waitForViewportImages(page, cfg.IMAGE_DECODE_MAX_WAIT_MS);
        await waitForScrollSettle(page, cfg.SETTLE_MAX_WAIT_MS);

        const docMetrics = await page.evaluate(() => ({
          scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
          clientHeight: window.innerHeight,
          scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        }));

        const newScrollY = Math.round(docMetrics.scrollY);
        if (newScrollY > maxScrollY) {
          maxScrollY = newScrollY;
        }

        if (docMetrics.scrollHeight > documentHeightAtStart + 1500) {
          documentHeightGrew = true;
        }

        // Check if page reached bottom
        const remainingDistance = docMetrics.scrollHeight - (newScrollY + docMetrics.clientHeight);
        if (remainingDistance <= 15) {
          notify(`Reached page bottom (${newScrollY}px scrolled).`);
          break;
        }

        // Check if scroll position is not progressing (locked/sticky footer/end)
        if (Math.abs(newScrollY - currentScrollY) < 5) {
          consecutiveUnchangedCount++;
          if (consecutiveUnchangedCount >= cfg.CONSECUTIVE_IDENTICAL_LIMIT) {
            notify("Scroll position stationary; reached bottom or scroll lock.");
            break;
          }
        } else {
          consecutiveUnchangedCount = 0;
        }

        currentScrollY = newScrollY;

        // Scroll down by step
        await page.mouse.wheel(0, cfg.SCROLL_STEP_PX);
        await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);

        // Fallback scroll if mouse wheel didn't advance scrollY
        const afterScrollY = await page.evaluate(
          () => window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
        );
        if (Math.abs(afterScrollY - currentScrollY) < 2) {
          await page.evaluate((stepPx) => window.scrollBy(0, stepPx), cfg.SCROLL_STEP_PX);
          await page.waitForTimeout(200);
        }
      }

      // Scroll back to top so fixed/sticky elements anchor cleanly at y=0
      notify("Rolling pass complete. Returning to top for clean full-page capture...");
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(400);

      // Take complete full-page screenshot
      notify("Capturing full-page continuous screenshot...");
      fullPngBuffer = await page.screenshot({ fullPage: true, type: "png" });
    } else {
      // Branch B: Virtual-scroll / WebGL presentation (fixed 100vh viewport)
      notify(
        `Virtual-scroll presentation detected (fixed viewport height ${initialMetrics.scrollHeight}px). Stepping through virtual scenes...`
      );

      const scenePngs: Buffer[] = [];
      const initialPng = await page.screenshot({ fullPage: false, type: "png" });
      scenePngs.push(initialPng);

      let consecutiveIdentical = 0;
      const maxScenes = cfg.VIRTUAL_SCROLL?.MAX_SCENES || 10;
      const wheelStep = cfg.VIRTUAL_SCROLL?.WHEEL_STEP_PX || 1500;
      const waitMs = cfg.VIRTUAL_SCROLL?.TRANSITION_WAIT_MS || 1200;

      for (let step = 1; step <= maxScenes; step++) {
        totalStepsTaken++;

        await page.mouse.move(cfg.VIEWPORT.width / 2, cfg.VIEWPORT.height / 2);
        await page.mouse.wheel(0, wheelStep);
        await page.waitForTimeout(waitMs);
        await waitForViewportImages(page, cfg.IMAGE_DECODE_MAX_WAIT_MS);

        const currentPng = await page.screenshot({ fullPage: false, type: "png" });
        const lastScenePng = scenePngs[scenePngs.length - 1];

        // Check difference from previous scene
        const diffFromLast = await computeMaxBlockDifference(
          lastScenePng,
          currentPng,
          cfg.DEDUPLICATION.THUMB_WIDTH,
          cfg.DEDUPLICATION.THUMB_HEIGHT,
          cfg.DEDUPLICATION.BLOCK_SIZE_X,
          cfg.DEDUPLICATION.BLOCK_SIZE_Y
        );

        // Check if presentation has looped back to an earlier scene
        let isLoop = false;
        if (scenePngs.length >= 3) {
          for (let sIdx = 0; sIdx < Math.min(3, scenePngs.length - 1); sIdx++) {
            const loopDiff = await computeMaxBlockDifference(
              scenePngs[sIdx],
              currentPng,
              cfg.DEDUPLICATION.THUMB_WIDTH,
              cfg.DEDUPLICATION.THUMB_HEIGHT,
              cfg.DEDUPLICATION.BLOCK_SIZE_X,
              cfg.DEDUPLICATION.BLOCK_SIZE_Y
            );
            if (loopDiff < cfg.DEDUPLICATION.DIFF_THRESHOLD) {
              isLoop = true;
              break;
            }
          }
        }

        if (isLoop) {
          notify("Virtual presentation looped back to beginning. Completing scene capture.");
          break;
        }

        if (diffFromLast >= cfg.DEDUPLICATION.DIFF_THRESHOLD) {
          scenePngs.push(currentPng);
          consecutiveIdentical = 0;
          notify(`Captured distinct virtual scene ${scenePngs.length}...`);
        } else {
          consecutiveIdentical++;
          if (consecutiveIdentical >= 2) {
            notify("Virtual presentation reached end of scenes.");
            break;
          }
        }
      }

      // Stitch distinct virtual scenes vertically into 1 continuous canvas
      const totalHeight = scenePngs.length * cfg.VIEWPORT.height;
      notify(
        `Stitching ${scenePngs.length} virtual scenes into 1 continuous image (${cfg.VIEWPORT.width}x${totalHeight}px)...`
      );

      const composites = scenePngs.map((buf, i) => ({
        input: buf,
        top: i * cfg.VIEWPORT.height,
        left: 0,
      }));

      fullPngBuffer = await sharp({
        create: {
          width: cfg.VIEWPORT.width,
          height: totalHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      })
        .composite(composites)
        .png()
        .toBuffer();
    }

    // Inspect image dimensions
    const imageMeta = await sharp(fullPngBuffer).metadata();
    const fullWidth = imageMeta.width || cfg.VIEWPORT.width;
    const fullHeight = imageMeta.height || cfg.VIEWPORT.height;
    const maxHeightLimit = cfg.MAX_SINGLE_IMAGE_HEIGHT || 15000;

    if (fullHeight <= maxHeightLimit) {
      // Keep as 1 continuous single image
      notify(`Page fits in 1 continuous screenshot (${fullWidth}x${fullHeight}px). Converting to WebP...`);
      const webpBuffer = await sharp(fullPngBuffer)
        .webp({ quality: cfg.IMAGE_FORMAT.QUALITY, effort: cfg.IMAGE_FORMAT.EFFORT })
        .toBuffer();

      sections.push({
        index: 1,
        buffer: webpBuffer,
        width: fullWidth,
        height: fullHeight,
        scrollY: 0,
        newContentHeight: fullHeight,
      });
    } else {
      // Exceptionally long page: split into chunks when limit is hit
      const totalChunks = Math.ceil(fullHeight / maxHeightLimit);
      notify(
        `Page height (${fullHeight}px) exceeds ${maxHeightLimit}px limit. Splitting into ${totalChunks} continuous chunks...`
      );

      let topOffset = 0;
      let sectionIndex = 1;

      while (topOffset < fullHeight) {
        const chunkHeight = Math.min(maxHeightLimit, fullHeight - topOffset);
        const chunkBuffer = await sharp(fullPngBuffer)
          .extract({
            left: 0,
            top: topOffset,
            width: fullWidth,
            height: chunkHeight,
          })
          .webp({ quality: cfg.IMAGE_FORMAT.QUALITY, effort: cfg.IMAGE_FORMAT.EFFORT })
          .toBuffer();

        sections.push({
          index: sectionIndex,
          buffer: chunkBuffer,
          width: fullWidth,
          height: chunkHeight,
          scrollY: topOffset,
          newContentHeight: chunkHeight,
          isCropped: topOffset > 0,
        });

        notify(`Processed chunk ${sectionIndex}/${totalChunks} (${fullWidth}x${chunkHeight}px)`);
        topOffset += chunkHeight;
        sectionIndex++;
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
        stopReasonText = `Stopped early after ${totalStepsTaken} steps to avoid an endless page`;
      } else {
        stopReasonText = `Stopped early after ${totalStepsTaken} steps; page continued`;
      }
    }

    notify(
      `Capture complete: ${sections.length} image(s) produced (${fullWidth}x${fullHeight}px total).`
    );

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
