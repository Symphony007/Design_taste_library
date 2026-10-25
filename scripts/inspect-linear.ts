import sharp from "sharp";
import { captureUrl } from "../src/capture/index.js";

async function inspectLinear() {
  console.log("=== INSPECTING LINEAR CAPTURE ON DISK ===");
  const fullPath = "data/screenshots/20261023210706-linear-app-b2dd/full.png";
  const thumbPath = "data/screenshots/20261023210706-linear-app-b2dd/thumb.png";

  const fullMeta = await sharp(fullPath).metadata();
  const thumbMeta = await sharp(thumbPath).metadata();
  console.log(`full.png on disk: ${fullMeta.width}x${fullMeta.height} px`);
  console.log(`thumb.png on disk: ${thumbMeta.width}x${thumbMeta.height} px`);

  console.log("\n=== RUNNING CAPTURE WITH LOGGING TO GET RAW METRICS ===");
  const result = await captureUrl("https://linear.app", {
    onProgress: (msg) => console.log(`[Linear Capture] ${msg}`),
  });

  console.log("\n=== RESULT OBJECT ===");
  console.log(JSON.stringify({
    capturePathUsed: result.capturePathUsed,
    contentCheck: result.contentCheck,
    totalHeight: result.totalHeight,
    isCapped: result.isCapped,
    fullPagePath: result.fullPagePath,
  }, null, 2));
}

inspectLinear().catch(console.error);
