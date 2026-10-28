#!/usr/bin/env node
import { captureSections } from "./index.js";

async function main() {
  const args = process.argv.slice(2);
  const targetUrl = args[0];

  if (!targetUrl || targetUrl === "--help" || targetUrl === "-h") {
    console.error("Usage: npm run capture -- <url>");
    console.error("Example: npm run capture -- https://example.com");
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(` Specimen - Website Section Capture`);
  console.log(` Target: ${targetUrl}`);
  console.log(`========================================\n`);

  const startTime = Date.now();

  try {
    const result = await captureSections(targetUrl, {
      onProgress: (msg) => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsedSec}s] ${msg}`);
      },
    });

    const totalDurationSec = (result.durationMs / 1000).toFixed(1);

    console.log(`\n========================================`);
    console.log(` Capture Completed in ${totalDurationSec}s!`);
    console.log(`========================================`);
    console.log(` Title:        ${result.title}`);
    console.log(` Capture ID:   ${result.captureId}`);
    console.log(` Sections Kept: ${result.keptCount}`);
    console.log(` Frames Dropped: ${result.droppedCount}`);
    console.log(` Stop Reason:  ${result.stopReason}`);
    console.log(` Safety Limit: ${result.hitSafetyLimit ? "HIT" : "No"}`);
    console.log(`========================================\n`);
  } catch (error: any) {
    console.error(`\n[ERROR] Capture failed: ${error.message || error}\n`);
    process.exit(1);
  }
}

main();
