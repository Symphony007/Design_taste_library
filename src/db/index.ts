import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.resolve(DATA_DIR, "taste.db");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode for high concurrency and performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * Initializes the database schema.
 */
export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
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
}

// Auto-run schema initialization
initDb();
