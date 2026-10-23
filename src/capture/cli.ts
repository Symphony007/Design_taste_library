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
    console.log(` Path Used:    ${result.capturePathUsed.toUpperCase()}`);
    console.log(` Content Check: ${result.contentCheck.passed ? "PASSED" : "FAILED"} (${result.contentCheck.mismatchedRegions}/${result.contentCheck.testedRegions} mismatched)`);
    if (result.framesKept !== undefined) {
      console.log(` Frames Kept:  ${result.framesKept} (${result.framesDropped || 0} dropped)`);
    }
    console.log(` Capped:       ${result.isCapped ? "YES" : "No"}`);
    console.log(` Full Image:   ${result.fullPagePath}`);
    console.log(` Thumbnail:    ${result.thumbnailPath}`);
    console.log(`========================================\n`);

    console.log("Saved Paths:");
    console.log(
      JSON.stringify(
        {
          fullPagePath: result.fullPagePath,
          thumbnailPath: result.thumbnailPath,
          capturePathUsed: result.capturePathUsed,
          totalHeight: result.totalHeight,
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
