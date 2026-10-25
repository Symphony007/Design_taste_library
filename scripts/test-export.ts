import fs from "node:fs";
import path from "node:path";
import { createExportArchive } from "../src/services/export-service.js";

async function runExportTest() {
  console.log("=== EXPORTING WHOLE LIBRARY ===");
  const exportResult = await createExportArchive({ scope: "all" });

  const outZipPath = path.resolve(process.cwd(), "data", "taste-skill.zip");
  const output = fs.createWriteStream(outZipPath);

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    exportResult.archive.on("error", reject);
  });

  exportResult.archive.pipe(output);
  await exportResult.archive.finalize();
  await done;

  const zipStat = fs.statSync(outZipPath);
  console.log(`Export archive written: ${outZipPath}`);
  console.log(`Total ZIP file size: ${(zipStat.size / (1024 * 1024)).toFixed(2)} MB (${zipStat.size} bytes)`);
  console.log(`Entries included: ${exportResult.entryCount}`);
  if (exportResult.warnings.length > 0) {
    console.log(`Warnings:`, exportResult.warnings);
  }
}

runExportTest().catch(console.error);
