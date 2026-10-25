import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { CAPTURE_CONFIG, type CaptureConfig } from "./config.js";
import { dismissCookieBanner } from "./cookie-dismiss.js";
import { isSafeUrl } from "./url-safety.js";

export { CAPTURE_CONFIG } from "./config.js";

export interface CapturedSection {
  index: number;
  buffer: Buffer; // Compressed WebP
  width: number;
  height: number;
  scrollY: number;
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
  hitSafetyLimit: boolean;
  durationMs: number;
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
 * Waits until images currently visible in the viewport have finished loading and decoding.
 */
async function waitForViewportImages(page: Page, maxWaitMs: number): Promise<void> {
  await page
    .evaluate(
      (timeout) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, timeout);

          const images = Array.from(document.querySelectorAll("img"));
          const vh = window.innerHeight;
          const inViewportImages = images.filter((img) => {
            const rect = img.getBoundingClientRect();
            return rect.bottom >= 0 && rect.top <= vh && rect.width > 0 && rect.height > 0;
          });

          if (inViewportImages.length === 0) {
            clearTimeout(timer);
            resolve();
            return;
          }

          const pending = inViewportImages.map((img) => {
            if (img.complete) {
              if (typeof img.decode === "function") {
                return img.decode().catch(() => {});
              }
              return Promise.resolve();
            }
            return new Promise<void>((imgResolve) => {
              img.addEventListener("load", () => imgResolve(), { once: true });
              img.addEventListener("error", () => imgResolve(), { once: true });
            });
          });

          Promise.all(pending).then(() => {
            clearTimeout(timer);
            resolve();
          });
        }),
      maxWaitMs
    )
    .catch(() => {});
}

/**
 * Waits until document height and scroll position are stationary.
 */
async function waitForScrollSettle(page: Page, maxWaitMs: number): Promise<void> {
  const startTime = Date.now();
  let prevScrollY = -1;
  let prevHeight = -1;

  while (Date.now() - startTime < maxWaitMs) {
    const metrics = await page
      .evaluate(() => ({
        scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      }))
      .catch(() => null);

    if (!metrics) break;

    if (
      prevScrollY !== -1 &&
      Math.abs(metrics.scrollY - prevScrollY) < 2 &&
      metrics.height === prevHeight
    ) {
      // Settled
      break;
    }

    prevScrollY = metrics.scrollY;
    prevHeight = metrics.height;
    await page.waitForTimeout(100).catch(() => {});
  }
}

/**
 * Executes section-by-section auto-capture.
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
    await page.waitForTimeout(300);

    // Position mouse cursor in center of viewport so mouse.wheel works
    await page.mouse.move(cfg.VIEWPORT.width / 2, cfg.VIEWPORT.height / 2);

    let reachedBottom = false;

    while (!reachedBottom) {
      totalStepsTaken++;

      // Check safety limits
      if (totalStepsTaken > cfg.SAFETY_LIMITS.MAX_TOTAL_STEPS) {
        stopReason = "safety_steps_limit";
        notify(`Safety limit reached (${cfg.SAFETY_LIMITS.MAX_TOTAL_STEPS} steps max).`);
        break;
      }

      if (Date.now() - startTime > cfg.SAFETY_LIMITS.MAX_CAPTURE_TIME_MS) {
        stopReason = "safety_time_limit";
        notify(`Safety time limit reached (${cfg.SAFETY_LIMITS.MAX_CAPTURE_TIME_MS / 1000}s max).`);
        break;
      }

      // Wait for viewport images and scroll settle
      await waitForViewportImages(page, cfg.IMAGE_DECODE_MAX_WAIT_MS);
      await waitForScrollSettle(page, cfg.SETTLE_MAX_WAIT_MS);

      const currentScrollY = await page.evaluate(
        () => window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
      );

      // Take raw viewport screenshot
      const currentPngBuffer = await page.screenshot({ fullPage: false });

      // Frame deduplication check
      let isDistinct = true;
      if (previousKeptPngBuffer !== null) {
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

        // Convert to WebP for compact storage
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
        });

        notify(`Captured section ${sectionIndex} at scrollY ${Math.round(currentScrollY)}px`);
      } else {
        droppedCount++;
        consecutiveIdenticalCount++;
        notify(
          `Skipped identical frame (identical streak: ${consecutiveIdenticalCount}/${cfg.CONSECUTIVE_IDENTICAL_LIMIT})`
        );

        if (consecutiveIdenticalCount >= cfg.CONSECUTIVE_IDENTICAL_LIMIT) {
          stopReason = "consecutive_identical";
          notify(`Stopped after ${cfg.CONSECUTIVE_IDENTICAL_LIMIT} consecutive identical frames.`);
          break;
        }
      }

      // Check if page end is reached
      const metrics = await page.evaluate(() => ({
        scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        clientHeight: window.innerHeight,
      }));

      if (metrics.scrollY + metrics.clientHeight >= metrics.scrollHeight - 5) {
        reachedBottom = true;
        stopReason = "page_end";
        break;
      }

      // Scroll down by one viewport step using mouse wheel
      await page.mouse.wheel(0, cfg.SCROLL_STEP_PX);
      await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);

      const afterScrollY = await page.evaluate(
        () => window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
      );

      // Fallback scroll if mouse wheel didn't scroll document (e.g. non-focusable container)
      if (Math.abs(afterScrollY - currentScrollY) < 2) {
        await page.evaluate((stepPx) => window.scrollBy(0, stepPx), cfg.SCROLL_STEP_PX);
        await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);
      }
    }

    // Bottom frame logic:
    // "Take an extra bottom frame only if lastScrollY + viewportHeight < documentScrollHeight - 150. Otherwise skip it."
    if (stopReason === "page_end") {
      const finalMetrics = await page.evaluate(() => ({
        scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        clientHeight: window.innerHeight,
      }));

      if (
        finalMetrics.scrollY + finalMetrics.clientHeight <
        finalMetrics.scrollHeight - cfg.BOTTOM_FRAME_THRESHOLD_PX
      ) {
        notify("Taking final bottom frame to include footer...");
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
        await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);
        await waitForViewportImages(page, cfg.IMAGE_DECODE_MAX_WAIT_MS);

        const bottomPngBuffer = await page.screenshot({ fullPage: false });
        let isBottomDistinct = true;
        if (previousKeptPngBuffer !== null) {
          const diff = await computeMaxBlockDifference(
            bottomPngBuffer,
            previousKeptPngBuffer,
            cfg.DEDUPLICATION.THUMB_WIDTH,
            cfg.DEDUPLICATION.THUMB_HEIGHT,
            cfg.DEDUPLICATION.BLOCK_SIZE_X,
            cfg.DEDUPLICATION.BLOCK_SIZE_Y
          );
          if (diff < cfg.DEDUPLICATION.DIFF_THRESHOLD) {
            isBottomDistinct = false;
          }
        }

        if (isBottomDistinct) {
          const webpBuffer = await sharp(bottomPngBuffer)
            .webp({ quality: cfg.IMAGE_FORMAT.QUALITY, effort: cfg.IMAGE_FORMAT.EFFORT })
            .toBuffer();

          const sectionIndex = sections.length + 1;
          sections.push({
            index: sectionIndex,
            buffer: webpBuffer,
            width: cfg.VIEWPORT.width,
            height: cfg.VIEWPORT.height,
            scrollY: Math.round(finalMetrics.scrollHeight - finalMetrics.clientHeight),
          });
          notify(`Captured final bottom section ${sectionIndex}`);
        } else {
          droppedCount++;
        }
      }
    }

    notify(`Auto-capture complete: ${sections.length} kept, ${droppedCount} dropped. Reason: ${stopReason}`);

    return {
      captureId,
      url: targetUrl,
      title: pageTitle,
      sections,
      totalStepsTaken,
      keptCount: sections.length,
      droppedCount,
      stopReason,
      hitSafetyLimit: stopReason === "safety_steps_limit" || stopReason === "safety_time_limit",
      durationMs: Date.now() - startTime,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
