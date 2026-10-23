import { db } from "./index.js";

const DEFAULT_DIRECTION_NOTES = "";

export function getSetting(key: string): string | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function getDirectionNotes(): string {
  const notes = getSetting("direction_notes");
  return notes !== null ? notes : DEFAULT_DIRECTION_NOTES;
}

export function setDirectionNotes(notes: string): void {
  setSetting("direction_notes", notes);
}
