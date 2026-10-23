import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CAPTURE_CONFIG } from "../capture/config.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.resolve(DATA_DIR, "taste.db");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

// Pragmas for performance and data integrity
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize schema on first run
export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      full_page_path TEXT NOT NULL,
      steps_dir TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      full_page_unreliable INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Safe migration: check if full_page_unreliable column exists
  const tableInfo = db.pragma("table_info(entries)") as { name: string }[];
  const hasColumn = tableInfo.some((col) => col.name === "full_page_unreliable");
  if (!hasColumn) {
    db.exec(`ALTER TABLE entries ADD COLUMN full_page_unreliable INTEGER NOT NULL DEFAULT 0;`);
  }

  // Backfill existing entries if needed
  migrateExistingEntries();
}

function migrateExistingEntries(): void {
  try {
    const rows = db.prepare("SELECT id, full_page_path, steps_dir FROM entries WHERE full_page_unreliable = 0").all() as {
      id: string;
      full_page_path: string;
      steps_dir: string;
    }[];

    const maxSingleViewportHeight =
      CAPTURE_CONFIG.VIEWPORT.height * CAPTURE_CONFIG.SCROLL_LOCK_DETECTION.MAX_SINGLE_VIEWPORT_FACTOR;
    const minSteps = CAPTURE_CONFIG.SCROLL_LOCK_DETECTION.MIN_STEPS_FOR_UNRELIABLE;

    const updateStmt = db.prepare("UPDATE entries SET full_page_unreliable = 1 WHERE id = ?");

    for (const row of rows) {
      if (fs.existsSync(row.steps_dir)) {
        const stepFiles = fs.readdirSync(row.steps_dir).filter((f) => f.endsWith(".png"));
        if (stepFiles.length >= minSteps && fs.existsSync(row.full_page_path)) {
          sharp(row.full_page_path).metadata().then((meta) => {
            if (meta.height && meta.height <= maxSingleViewportHeight) {
              updateStmt.run(row.id);
            }
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error("Migration check failed:", err);
  }
}

// Auto-run schema initialization
initDb();
