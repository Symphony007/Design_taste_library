#!/usr/bin/env node
import { captureUrl } from "./index.js";

async function main() {
  const args = process.argv.slice(2);
  const targetUrl = args[0];

  if (!targetUrl || targetUrl === "--help" || targetUrl === "-h") {
    console.error("Usage: npm run capture -- <url>");
    console.error("Example: npm run capture -- https://example.com");
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(` Taste - Website Capture`);
  console.log(` Target: ${targetUrl}`);
  console.log(`========================================\n`);

  const startTime = Date.now();

  try {
    const result = await captureUrl(targetUrl, {
      onProgress: (msg) => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsedSec}s] ${msg}`);
      },
    });

    const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n========================================`);
    console.log(` Capture Completed in ${totalDurationSec}s!`);
    console.log(`========================================`);
    console.log(` Title:        ${result.title}`);
    console.log(` Capture ID:   ${result.captureId}`);
    console.log(` Total Height: ${result.totalHeight}px`);
    console.log(` Capped:       ${result.isCapped ? "YES (exceeded max page height limit)" : "No"}`);
    console.log(` Steps Saved:  ${result.stepPaths.length} viewports`);
    console.log(` Steps Folder: ${result.stepsDir}`);
    console.log(` Full Image:   ${result.fullPagePath}`);
    console.log(`========================================\n`);

    // Output raw JSON paths for scripting / programmatic convenience
    console.log("Saved Paths:");
    console.log(
      JSON.stringify(
        {
          fullPagePath: result.fullPagePath,
          stepsDir: result.stepsDir,
          stepPaths: result.stepPaths,
        },
        null,
        2
      )
    );
  } catch (error: any) {
    console.error(`\n[ERROR] Capture failed: ${error.message || error}\n`);
    process.exit(1);
  }
}

main();
