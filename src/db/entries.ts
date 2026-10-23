import { db } from "./index.js";

export interface Entry {
  id: string;
  url: string;
  title: string;
  category: string | null;
  tags: string[];
  notes: string | null;
  full_page_path: string;
  steps_dir: string;
  captured_at: string;
  full_page_unreliable: boolean;
}

interface RawDbEntry {
  id: string;
  url: string;
  title: string;
  category: string | null;
  tags: string; // JSON string
  notes: string | null;
  full_page_path: string;
  steps_dir: string;
  captured_at: string;
  full_page_unreliable: number;
}

export interface CreateEntryInput {
  id: string;
  url: string;
  title: string;
  category?: string | null;
  tags?: string[];
  notes?: string | null;
  full_page_path: string;
  steps_dir: string;
  captured_at?: string;
  full_page_unreliable?: boolean;
}

export interface UpdateEntryInput {
  category?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface EntryFilter {
  category?: string;
  tag?: string;
}

/**
 * Maps raw database row with JSON tags string to typed Entry with real array.
 */
function toEntry(row: RawDbEntry): Entry {
  let parsedTags: string[] = [];
  try {
    parsedTags = JSON.parse(row.tags || "[]");
    if (!Array.isArray(parsedTags)) {
      parsedTags = [];
    }
  } catch {
    parsedTags = [];
  }

  return {
    id: row.id,
    url: row.url,
    title: row.title,
    category: row.category ?? null,
    tags: parsedTags,
    notes: row.notes ?? null,
    full_page_path: row.full_page_path,
    steps_dir: row.steps_dir,
    captured_at: row.captured_at,
    full_page_unreliable: Boolean(row.full_page_unreliable),
  };
}

/**
 * Creates a new entry record in SQLite.
 */
export function createEntry(input: CreateEntryInput): Entry {
  const tagsJson = JSON.stringify(input.tags || []);
  const capturedAt = input.captured_at || new Date().toISOString();
  const fullPageUnreliable = input.full_page_unreliable ? 1 : 0;

  const stmt = db.prepare(`
    INSERT INTO entries (id, url, title, category, tags, notes, full_page_path, steps_dir, captured_at, full_page_unreliable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    input.id,
    input.url,
    input.title,
    input.category ?? null,
    tagsJson,
    input.notes ?? null,
    input.full_page_path,
    input.steps_dir,
    capturedAt,
    fullPageUnreliable
  );

  return {
    id: input.id,
    url: input.url,
    title: input.title,
    category: input.category ?? null,
    tags: input.tags || [],
    notes: input.notes ?? null,
    full_page_path: input.full_page_path,
    steps_dir: input.steps_dir,
    captured_at: capturedAt,
    full_page_unreliable: Boolean(input.full_page_unreliable),
  };
}

/**
 * Fetches an entry by its ID.
 */
export function getEntryById(id: string): Entry | null {
  const stmt = db.prepare<[string], RawDbEntry>(`SELECT * FROM entries WHERE id = ?`);
  const row = stmt.get(id);
  return row ? toEntry(row) : null;
}

/**
 * Fetches an entry by its normalized URL.
 */
export function getEntryByUrl(url: string): Entry | null {
  const stmt = db.prepare<[string], RawDbEntry>(`SELECT * FROM entries WHERE url = ?`);
  const row = stmt.get(url);
  return row ? toEntry(row) : null;
}

/**
 * Lists entries, sorted newest first, with optional category and tag filters.
 */
export function listEntries(filter?: EntryFilter): Entry[] {
  let query = `SELECT * FROM entries WHERE 1=1`;
  const params: any[] = [];

  if (filter?.category) {
    query += ` AND category = ?`;
    params.push(filter.category);
  }

  if (filter?.tag) {
    // Filter by tag inside the JSON array using SQLite's json_each
    query += ` AND EXISTS (SELECT 1 FROM json_each(entries.tags) WHERE value = ?)`;
    params.push(filter.tag);
  }

  query += ` ORDER BY captured_at DESC`;

  const stmt = db.prepare<any[], RawDbEntry>(query);
  const rows = stmt.all(...params);
  return rows.map(toEntry);
}

/**
 * Updates an entry's category, tags, and notes only.
 * Returns the updated Entry, or null if the entry does not exist.
 */
export function updateEntry(id: string, updates: UpdateEntryInput): Entry | null {
  const existing = getEntryById(id);
  if (!existing) {
    return null;
  }

  const newCategory = updates.category !== undefined ? updates.category : existing.category;
  const newNotes = updates.notes !== undefined ? updates.notes : existing.notes;
  const newTags = updates.tags !== undefined ? updates.tags : existing.tags;
  const tagsJson = JSON.stringify(newTags);

  const stmt = db.prepare(`
    UPDATE entries
    SET category = ?, tags = ?, notes = ?
    WHERE id = ?
  `);

  stmt.run(newCategory, tagsJson, newNotes, id);

  return {
    ...existing,
    category: newCategory,
    tags: newTags,
    notes: newNotes,
  };
}

/**
 * Deletes an entry from SQLite by ID. Returns true if a row was deleted.
 */
export function deleteEntry(id: string): boolean {
  const stmt = db.prepare(`DELETE FROM entries WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}
