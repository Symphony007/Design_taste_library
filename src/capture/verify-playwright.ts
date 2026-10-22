import { chromium } from "playwright";

async function verifyPlaywright() {
  console.log("Launching Chromium headless browser test...");
  const browser = await chromium.launch({ headless: true });
  const version = browser.version();
  console.log(`Chromium launched successfully! Version: ${version}`);
  await browser.close();
  console.log("Browser closed successfully.");
}

verifyPlaywright().catch((err) => {
  console.error("Playwright verification failed:", err);
  process.exit(1);
});
