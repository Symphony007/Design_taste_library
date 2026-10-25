import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import Database from "better-sqlite3";

const db = new Database("data/taste.db");
const entries = db.prepare("SELECT id, url, full_page_path, captured_at FROM entries ORDER BY captured_at DESC").all() as any[];

async function run() {
  console.log("=== ENTRY INSPECTION ON DISK ===");
  for (const e of entries) {
    const fullPath = e.full_page_path;
    const thumbPath = fullPath.replace("full.png", "thumb.png");

    let fullMeta: any = {};
    let fullStat: any = {};
    let thumbMeta: any = {};
    let thumbStat: any = {};

    try {
      fullMeta = await sharp(fullPath).metadata();
      fullStat = fs.statSync(fullPath);
    } catch (err: any) {
      fullMeta = { error: err.message };
    }

    try {
      thumbMeta = await sharp(thumbPath).metadata();
      thumbStat = fs.statSync(thumbPath);
    } catch (err: any) {
      thumbMeta = { error: err.message };
    }

    console.log(`\nEntry ID: ${e.id}`);
    console.log(`URL: ${e.url}`);
    console.log(`captured_at: ${e.captured_at}`);
    console.log(`full.png: ${fullMeta.width}x${fullMeta.height} px | ${(fullStat.size / (1024 * 1024)).toFixed(2)} MB (${fullStat.size} bytes)`);
    console.log(`thumb.png: ${thumbMeta.width}x${thumbMeta.height} px | ${(thumbStat.size / 1024).toFixed(2)} KB (${thumbStat.size} bytes)`);
  }
}

run().catch(console.error);
