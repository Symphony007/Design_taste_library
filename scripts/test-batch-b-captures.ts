import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { captureAndCreateEntry } from "../src/services/capture-service.js";

const ARTIFACT_DIR = "C:\\Users\\Deepmalya\\.gemini\\antigravity-ide\\brain\\b164429d-b420-464a-87c2-bd057ef29390";

const TEST_TARGETS = [
  { name: "EnduroSat", url: "https://www.endurosat.com/space-service", slug: "endurosat" },
  { name: "Portobello Cafe", url: "https://theportobellocafe.com/", slug: "portobello" },
  { name: "Hacker News", url: "https://news.ycombinator.com/", slug: "hackernews" },
  { name: "Linear", url: "https://linear.app/", slug: "linear" },
];

async function generateContactSheet(
  frames: Buffer[],
  outPath: string
): Promise<void> {
  const thumbWidth = 360;
  const thumbHeight = 225;
  const gap = 10;
  const totalWidth = frames.length * thumbWidth + (frames.length + 1) * gap;
  const totalHeight = thumbHeight + 2 * gap;

  const resizedThumbs = await Promise.all(
    frames.map(async (buf) =>
      sharp(buf)
        .resize(thumbWidth, thumbHeight, { fit: "cover" })
        .toBuffer()
    )
  );

  const compositeInputs = resizedThumbs.map((buf, i) => ({
    input: buf,
    left: gap + i * (thumbWidth + gap),
    top: gap,
  }));

  await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 24, g: 24, b: 27, alpha: 1 }, // dark slate background
    },
  })
    .composite(compositeInputs)
    .png()
    .toFile(outPath);
}

async function runTests() {
  console.log("=== BATCH B CAPTURE VERIFICATION ===\n");

  const results: any[] = [];

  for (const target of TEST_TARGETS) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Capturing: ${target.name} (${target.url})`);
    console.log(`--------------------------------------------------`);

    const startTime = Date.now();
    try {
      const { entry, captureResult } = await captureAndCreateEntry(target.url, {
        force: true,
        onProgress: (msg) => console.log(`[${target.name}] ${msg}`),
      });

      const contactSheetPath = path.resolve(ARTIFACT_DIR, `${target.slug}-contact-sheet.png`);
      const frameBuffers = captureResult.sections.map((s) => s.buffer);

      if (frameBuffers.length > 0) {
        await generateContactSheet(frameBuffers, contactSheetPath);
        console.log(`[${target.name}] Contact sheet generated at: ${contactSheetPath}`);
      }

      results.push({
        name: target.name,
        url: target.url,
        slug: target.slug,
        title: entry.title,
        kept: captureResult.keptCount,
        dropped: captureResult.droppedCount,
        stopReason: captureResult.stopReason,
        hitSafetyLimit: captureResult.hitSafetyLimit,
        durationSec: (captureResult.durationMs / 1000).toFixed(1),
        contactSheetPath,
        sectionCount: entry.images.length,
      });
    } catch (err: any) {
      console.error(`[${target.name}] ERROR:`, err.message || err);
      results.push({
        name: target.name,
        url: target.url,
        slug: target.slug,
        error: err.message || String(err),
      });
    }
  }

  console.log("\n==================================================");
  console.log("FINAL BATCH B RESULTS SUMMARY");
  console.log("==================================================");
  console.log(JSON.stringify(results, null, 2));
}

runTests().catch(console.error);
