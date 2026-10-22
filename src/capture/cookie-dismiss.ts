import type { Page } from "playwright";

/**
 * Common selectors used by popular consent management platforms (CMPs)
 * and cookie banners.
 *
 * CRITICAL LESSON: Avoid broad text selectors like `button:has-text('Accept')`
 * across the whole document, because product sites (e.g. Stripe, payment processors)
 * often have feature cards or buttons saying "Accept payments" or "Accept credit cards"!
 * All selectors must be strictly scoped to cookie/consent/dialog containers or exact CMP IDs.
 */
const BANNER_SELECTORS: string[] = [
  // OneTrust
  "#onetrust-accept-btn-handler",
  "#onetrust-banner-sdk button#onetrust-accept-btn-handler",
  // Cookiebot
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "#CybotCookiebotDialogBodyButtonAccept",
  // Klaro, Didomi, Axeptio, CookieYes
  ".cm__btn--accept",
  "#didomi-notice-agree-button",
  "#axeptio_btn_acceptAll",
  ".cky-btn-accept",
  // Scoped cookie/consent containers
  "[id*='cookie' i] button[id*='accept' i]",
  "[class*='cookie' i] button[class*='accept' i]",
  "[id*='consent' i] button[id*='accept' i]",
  "[class*='consent' i] button[class*='accept' i]",
  "[aria-label*='cookie' i] button:has-text('Accept')",
  "[aria-label*='cookie' i] button:has-text('Allow')",
  "[aria-label*='consent' i] button:has-text('Accept')",
  "[role='dialog'][aria-label*='cookie' i] button",
  "[role='dialog'] button:has-text('Accept all cookies')",
  "[role='dialog'] button:has-text('Accept all')",
  "[role='dialog'] button:has-text('Allow all')",
];

/**
 * Attempts best-effort dismissal of consent/cookie banners.
 * Designed to be completely resilient: never throws or blocks capture.
 */
export async function dismissCookieBanner(page: Page): Promise<boolean> {
  try {
    for (const selector of BANNER_SELECTORS) {
      const button = page.locator(selector).first();
      const isVisible = await button.isVisible({ timeout: 200 }).catch(() => false);
      if (isVisible) {
        // Double-check element text to ensure we don't click marketing cards
        const text = ((await button.textContent().catch(() => "")) || "").trim().toLowerCase();
        // Skip if text sounds like a marketing card (e.g. "accept payments", "accept cards")
        if (text.includes("payments") || text.includes("cards") || text.length > 50) {
          continue;
        }

        await button.click({ timeout: 500 }).catch(() => {});
        await page.waitForTimeout(300).catch(() => {});
        return true;
      }
    }
  } catch {
    // Deliberately silent: banner dismissal is strictly best-effort
  }
  return false;
}
