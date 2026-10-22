import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { CAPTURE_CONFIG, type CaptureConfig } from "./config.js";
import { dismissCookieBanner } from "./cookie-dismiss.js";

export { CAPTURE_CONFIG } from "./config.js";

export interface CaptureOptions {
  config?: Partial<CaptureConfig>;
  onProgress?: (message: string) => void;
}

export interface CaptureResult {
  captureId: string;
  url: string;
  title: string;
  fullPagePath: string;
  stepsDir: string;
  stepPaths: string[];
  totalHeight: number;
  isCapped: boolean;
  capturedAt: string;
}

/**
 * Generates a clean, filesystem-safe capture ID based on timestamp and target domain.
 */
function generateCaptureId(rawUrl: string): string {
  const urlObj = new URL(rawUrl);
  const hostSlug = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
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
 * Captures full-page and step-by-step screenshots of a given URL.
 * Automatically handles banner dismissal, smooth scrolling, lazy loading, and capping.
 */
export async function captureUrl(
  inputUrl: string,
  options?: CaptureOptions
): Promise<CaptureResult> {
  const targetUrl = validateUrl(inputUrl);
  const cfg = { ...CAPTURE_CONFIG, ...options?.config };
  const notify = options?.onProgress || (() => {});

  const captureId = generateCaptureId(targetUrl);
  const captureDir = path.resolve(process.cwd(), cfg.OUTPUT_DIR, captureId);
  const stepsDir = path.resolve(captureDir, "steps");
  const fullPagePath = path.resolve(captureDir, "full.png");

  // Ensure output folders exist
  fs.mkdirSync(stepsDir, { recursive: true });

  let browser: Browser | null = null;
  const stepPaths: string[] = [];
  let isCapped = false;
  let totalHeight = 0;
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

    // Wait for network to settle, bounded by NETWORK_IDLE_TIMEOUT_MS so hanging websockets don't freeze us
    notify("Waiting for initial network activity to settle...");
    await page.waitForLoadState("networkidle", {
      timeout: cfg.NETWORK_IDLE_TIMEOUT_MS,
    }).catch(() => {
      // Common for analytics/websocket heavy sites; proceed without failing
    });

    pageTitle = (await page.title()) || targetUrl;

    // Best-effort dismissal of consent/cookie banners
    notify("Checking for cookie/consent banners to dismiss...");
    const bannerDismissed = await dismissCookieBanner(page);
    if (bannerDismissed) {
      notify("Cookie banner found and dismissed.");
    }

    // Initial page height and viewport measurements
    const initialMetrics = await page.evaluate(() => ({
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      clientHeight: window.innerHeight,
    }));
    totalHeight = initialMetrics.scrollHeight;

    notify(`Page loaded: "${pageTitle}" (initial height: ${totalHeight}px)`);

    // Ensure page is at absolute top (scrollY: 0) before starting step capture
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(300);

    // Position mouse cursor in center of viewport so mouse.wheel targets page content correctly
    await page.mouse.move(cfg.VIEWPORT.width / 2, cfg.VIEWPORT.height / 2);

    let stepIndex = 1;
    let currentScrollY = 0;
    let reachedBottom = false;

    notify("Beginning step-by-step viewport capture...");

    while (!reachedBottom) {
      const stepNumberStr = String(stepIndex).padStart(2, "0");
      const stepFile = path.resolve(stepsDir, `${stepNumberStr}.png`);

      // Capture current viewport
      await page.screenshot({ path: stepFile, fullPage: false });
      stepPaths.push(stepFile);
      notify(`Saved step screenshot: ${stepNumberStr}.png (at scrollY: ${Math.round(currentScrollY)}px)`);

      // Check if we hit the maximum page height cap
      if (currentScrollY + cfg.VIEWPORT.height >= cfg.MAX_PAGE_HEIGHT_PX) {
        isCapped = true;
        notify(
          `Page height cap reached (${cfg.MAX_PAGE_HEIGHT_PX}px limit). Stopping step capture.`
        );
        break;
      }

      // Check current scroll position and dynamic scroll height (sites may expand as we scroll)
      const metrics = await page.evaluate(() => ({
        scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        clientHeight: window.innerHeight,
      }));

      totalHeight = metrics.scrollHeight;

      // Are we already at or very near the bottom?
      if (metrics.scrollY + metrics.clientHeight >= metrics.scrollHeight - 5) {
        reachedBottom = true;
        break;
      }

      // Scroll down by one viewport step using real mouse wheel events.
      // Real wheel events trigger scroll listeners and smooth-scroll libraries (Lenis, GSAP, etc.)
      await page.mouse.wheel(0, cfg.SCROLL_STEP_PX);

      // Pause to let animations, lazy images, and reveals render
      await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);

      const afterMetrics = await page.evaluate(() => ({
        scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      }));

      // If wheel scrolling did not move scrollY (e.g. passive listener or non-standard container),
      // provide a fallback scroll so the capture doesn't get stuck in an infinite loop
      if (Math.abs(afterMetrics.scrollY - currentScrollY) < 2) {
        await page.evaluate((stepPx) => window.scrollBy(0, stepPx), cfg.SCROLL_STEP_PX);
        await page.waitForTimeout(cfg.PAUSE_PER_STEP_MS);
      }

      const finalMetrics = await page.evaluate(() => ({
        scrollY: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0,
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        clientHeight: window.innerHeight,
      }));

      // If still stuck after fallback, or reached bottom, stop stepping
      if (
        Math.abs(finalMetrics.scrollY - currentScrollY) < 2 ||
        finalMetrics.scrollY + finalMetrics.clientHeight >= finalMetrics.scrollHeight - 5
      ) {
        reachedBottom = true;
      }

      currentScrollY = finalMetrics.scrollY;
      totalHeight = finalMetrics.scrollHeight;
      stepIndex++;

      // Guardrail against excessive steps
      const maxSteps = Math.ceil(cfg.MAX_PAGE_HEIGHT_PX / cfg.SCROLL_STEP_PX) + 2;
      if (stepIndex > maxSteps) {
        isCapped = true;
        break;
      }
    }

    notify(`Completed step capture (${stepPaths.length} steps). Returning to top of page...`);

    // Reset scroll back to top and let elements settle before full-page capture
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.mouse.wheel(0, -999999);
    await page.waitForTimeout(cfg.SETTLE_DELAY_MS);

    // Refresh final scrollHeight
    const finalMetrics = await page.evaluate(() => ({
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    }));
    totalHeight = finalMetrics.scrollHeight;

    notify("Capturing full-page screenshot...");
    if (totalHeight > cfg.MAX_PAGE_HEIGHT_PX) {
      isCapped = true;
      notify(`Page height (${totalHeight}px) exceeds cap (${cfg.MAX_PAGE_HEIGHT_PX}px). Clipping full-page screenshot.`);
      await page.screenshot({
        path: fullPagePath,
        clip: {
          x: 0,
          y: 0,
          width: cfg.VIEWPORT.width,
          height: cfg.MAX_PAGE_HEIGHT_PX,
        },
      });
    } else {
      await page.screenshot({
        path: fullPagePath,
        fullPage: true,
      });
    }

    notify(`Full-page screenshot saved: ${fullPagePath}`);

    return {
      captureId,
      url: targetUrl,
      title: pageTitle,
      fullPagePath,
      stepsDir,
      stepPaths,
      totalHeight,
      isCapped,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    // Guaranteed cleanup: browser is always closed even if an exception occurs
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
