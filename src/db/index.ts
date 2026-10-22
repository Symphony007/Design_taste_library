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
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// Auto-run schema initialization
initDb();
