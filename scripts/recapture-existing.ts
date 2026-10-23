/**
 * One-off script to recapture all existing library entries using the new dependable capture engine.
 * Run only after user approval:
 *   npx tsx scripts/recapture-existing.ts
 */
import fs from "node:fs";
import path from "node:path";
import { listEntries } from "../src/db/entries.js";
import { captureAndCreateEntry } from "../src/services/capture-service.js";

async function main() {
  console.log("Fetching existing entries from database...");
  const entries = listEntries();
  console.log(`Found ${entries.length} entries to recapture.\n`);

  if (entries.length === 0) {
    console.log("No entries found in database.");
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    console.log(`[${i + 1}/${entries.length}] Recapturing: ${entry.title} (${entry.url})...`);

    try {
      const updated = await captureAndCreateEntry(entry.url, {
        force: true,
        notes: entry.notes || undefined,
      });

      // Remove leftover legacy steps folder if it exists
      const entryDir = path.resolve(process.cwd(), "data", "screenshots", entry.id);
      const legacyStepsDir = path.resolve(entryDir, "steps");
      if (fs.existsSync(legacyStepsDir)) {
        try {
          fs.rmSync(legacyStepsDir, { recursive: true, force: true });
        } catch {}
      }

      console.log(`  -> OK: ${entry.id} saved.`);
      succeeded++;
    } catch (err: any) {
      console.error(`  -> FAILED: ${entry.id} (${err.message || err})`);
      failed++;
    }
    console.log("");
  }

  console.log("-----------------------------------------");
  console.log(`Recapture complete. Succeeded: ${succeeded}, Failed: ${failed}`);
  console.log("-----------------------------------------");
}

main().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});
