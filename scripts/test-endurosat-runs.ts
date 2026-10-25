import sharp from "sharp";
import { captureUrl } from "../src/capture/index.js";

async function runTest() {
  const url = "https://www.endurosat.com/space-service";
  const runs = 3;

  console.log(`Starting ${runs} recapture test runs for EnduroSat (${url})...\n`);

  for (let runIndex = 1; runIndex <= runs; runIndex++) {
    console.log(`==================== RUN ${runIndex} ====================`);
    
    let peakRss = 0;
    const memInterval = setInterval(() => {
      const mem = process.memoryUsage();
      if (mem.rss > peakRss) peakRss = mem.rss;
    }, 50);

    let docHeightFromLog = 0;
    let maxScrollYFromLog = 0;
    let stepsTakenFromLog = 0;

    const result = await captureUrl(url, {
      onProgress: (msg) => {
        // parse interesting metrics
        const mHeight = msg.match(/measured document height: (\d+)px/);
        if (mHeight) docHeightFromLog = parseInt(mHeight[1], 10);

        const mTrust = msg.match(/maxScrollY: (\d+)px/);
        if (mTrust) maxScrollYFromLog = parseInt(mTrust[1], 10);

        const mSteps = msg.match(/Completed step sequence \((\d+) steps taken\)/);
        if (mSteps) stepsTakenFromLog = parseInt(mSteps[1], 10);

        console.log(`[Run ${runIndex}] ${msg}`);
      },
    });

    clearInterval(memInterval);
    const finalMeta = await sharp(result.fullPagePath).metadata();

    console.log(`\n--- RUN ${runIndex} RESULTS ---`);
    console.log(`Measured Document Height: ${docHeightFromLog || result.totalHeight} px`);
    console.log(`Max scrollY: ${maxScrollYFromLog} px`);
    console.log(`Steps taken: ${stepsTakenFromLog}`);
    console.log(`Frames kept: ${result.framesKept ?? "N/A"}`);
    console.log(`Frames dropped: ${result.framesDropped ?? "N/A"}`);
    console.log(`Path used: ${result.capturePathUsed}`);
    console.log(`Final image dimensions: ${finalMeta.width}x${finalMeta.height} px`);
    console.log(`Is capped: ${result.isCapped}`);
    console.log(`Peak memory (RSS): ${(peakRss / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`============================================\n`);
  }
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
