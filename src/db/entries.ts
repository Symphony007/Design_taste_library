import fs from "node:fs";
import path from "node:path";
import { db } from "./index.js";

export interface EntryImage {
  id: string;
  entry_id: string;
  position: number;
  file_path: string;
  width: number;
  height: number;
}

export interface Entry {
  id: string;
  title: string;
  source_url: string | null;
  notes: string | null;
  created_at: string;
  stop_reason: string | null;
  images: EntryImage[];
}

export interface CreateEntryInput {
  id: string;
  title: string;
  source_url?: string | null;
  notes?: string | null;
  created_at?: string;
  stop_reason?: string | null;
  images?: Array<{
    id: string;
    position: number;
    file_path: string;
    width: number;
    height: number;
  }>;
}

export interface UpdateEntryInput {
  title?: string;
  notes?: string | null;
}

/**
 * Creates an entry with optional initial images in a single transaction.
 */
export function createEntry(input: CreateEntryInput): Entry {
  const insertEntry = db.prepare(`
    INSERT INTO entries (id, title, source_url, notes, created_at, stop_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertImage = db.prepare(`
    INSERT INTO images (id, entry_id, position, file_path, width, height)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const createdAt = input.created_at || new Date().toISOString();

  const transaction = db.transaction(() => {
    insertEntry.run(
      input.id,
      input.title,
      input.source_url ?? null,
      input.notes ?? null,
      createdAt,
      input.stop_reason ?? null
    );

    if (input.images && input.images.length > 0) {
      for (const img of input.images) {
        insertImage.run(
          img.id,
          input.id,
          img.position,
          img.file_path,
          img.width,
          img.height
        );
      }
    }
  });

  transaction();

  return getEntryById(input.id)!;
}

/**
 * Lists all entries, sorted newest first, with their ordered images.
 */
export function listEntries(): Entry[] {
  const entries = db.prepare(`
    SELECT id, title, source_url, notes, created_at, stop_reason
    FROM entries
    ORDER BY created_at DESC
  `).all() as Omit<Entry, "images">[];

  if (entries.length === 0) return [];

  const images = db.prepare(`
    SELECT id, entry_id, position, file_path, width, height
    FROM images
    ORDER BY position ASC
  `).all() as EntryImage[];

  const imagesByEntry = new Map<string, EntryImage[]>();
  for (const img of images) {
    if (!imagesByEntry.has(img.entry_id)) {
      imagesByEntry.set(img.entry_id, []);
    }
    imagesByEntry.get(img.entry_id)!.push(img);
  }

  return entries.map((entry) => ({
    ...entry,
    images: imagesByEntry.get(entry.id) || [],
  }));
}

/**
 * Fetches a single entry by ID, with all images ordered by position.
 */
export function getEntryById(id: string): Entry | null {
  const entry = db.prepare(`
    SELECT id, title, source_url, notes, created_at, stop_reason
    FROM entries
    WHERE id = ?
  `).get(id) as Omit<Entry, "images"> | undefined;

  if (!entry) return null;

  const images = db.prepare(`
    SELECT id, entry_id, position, file_path, width, height
    FROM images
    WHERE entry_id = ?
    ORDER BY position ASC
  `).all(id) as EntryImage[];

  return {
    ...entry,
    images,
  };
}

/**
 * Fetches an entry by its source URL.
 */
export function getEntryByUrl(url: string): Entry | null {
  const entry = db.prepare(`
    SELECT id, title, source_url, notes, created_at, stop_reason
    FROM entries
    WHERE source_url = ?
  `).get(url) as Omit<Entry, "images"> | undefined;

  if (!entry) return null;

  return getEntryById(entry.id);
}

/**
 * Updates an entry's title and/or notes.
 */
export function updateEntry(id: string, updates: UpdateEntryInput): Entry | null {
  const existing = getEntryById(id);
  if (!existing) return null;

  const newTitle = updates.title !== undefined ? updates.title : existing.title;
  const newNotes = updates.notes !== undefined ? updates.notes : existing.notes;

  db.prepare(`
    UPDATE entries
    SET title = ?, notes = ?
    WHERE id = ?
  `).run(newTitle, newNotes, id);

  return getEntryById(id);
}

/**
 * Deletes an entry and removes its image files and folder from disk.
 */
export function deleteEntry(id: string): boolean {
  const entry = getEntryById(id);
  if (!entry) return false;

  // Delete all image files from disk
  for (const img of entry.images) {
    const fullPath = path.resolve(process.cwd(), "data", img.file_path);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (err) {
      console.error(`Failed to delete image file ${fullPath}:`, err);
    }
  }

  // Remove entry folder if empty or exists
  const entryDir = path.resolve(process.cwd(), "data", "images", id);
  try {
    if (fs.existsSync(entryDir)) {
      fs.rmSync(entryDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Failed to delete entry directory ${entryDir}:`, err);
  }

  const result = db.prepare(`DELETE FROM entries WHERE id = ?`).run(id);
  return result.changes > 0;
}

/**
 * Appends a new image to an entry at position max+1.
 */
export function addImageToEntry(
  entryId: string,
  image: { id: string; file_path: string; width: number; height: number; position?: number }
): EntryImage {
  const maxPosRow = db.prepare(`
    SELECT COALESCE(MAX(position), 0) as max_pos
    FROM images
    WHERE entry_id = ?
  `).get(entryId) as { max_pos: number };

  const nextPos = image.position !== undefined ? image.position : maxPosRow.max_pos + 1;

  db.prepare(`
    INSERT INTO images (id, entry_id, position, file_path, width, height)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(image.id, entryId, nextPos, image.file_path, image.width, image.height);

  return {
    id: image.id,
    entry_id: entryId,
    position: nextPos,
    file_path: image.file_path,
    width: image.width,
    height: image.height,
  };
}

/**
 * Deletes a single image, deletes the file from disk, and compacts remaining positions 1..N.
 */
export function deleteImage(entryId: string, imageId: string): boolean {
  const img = db.prepare(`
    SELECT id, entry_id, file_path
    FROM images
    WHERE id = ? AND entry_id = ?
  `).get(imageId, entryId) as EntryImage | undefined;

  if (!img) return false;

  // Delete file from disk
  const fullPath = path.resolve(process.cwd(), "data", img.file_path);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error(`Failed to delete image file ${fullPath}:`, err);
  }

  const transaction = db.transaction(() => {
    // Delete image record
    db.prepare(`DELETE FROM images WHERE id = ?`).run(imageId);

    // Compact remaining positions 1..N
    const remaining = db.prepare(`
      SELECT id
      FROM images
      WHERE entry_id = ?
      ORDER BY position ASC
    `).all(entryId) as { id: string }[];

    const updatePos = db.prepare(`
      UPDATE images
      SET position = ?
      WHERE id = ?
    `);

    for (let i = 0; i < remaining.length; i++) {
      updatePos.run(i + 1, remaining[i].id);
    }
  });

  transaction();
  return true;
}

/**
 * Replaces all images for an entry (used when recapturing with force: true).
 * Deletes old files from disk, inserts new images, updates stop_reason.
 */
export function replaceEntryImages(
  entryId: string,
  newImages: Array<{ id: string; position: number; file_path: string; width: number; height: number }>,
  stopReason?: string | null
): void {
  const oldImages = db.prepare(`
    SELECT file_path FROM images WHERE entry_id = ?
  `).all(entryId) as { file_path: string }[];

  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM images WHERE entry_id = ?`).run(entryId);

    const insertImage = db.prepare(`
      INSERT INTO images (id, entry_id, position, file_path, width, height)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const img of newImages) {
      insertImage.run(img.id, entryId, img.position, img.file_path, img.width, img.height);
    }

    if (stopReason !== undefined) {
      db.prepare(`UPDATE entries SET stop_reason = ? WHERE id = ?`).run(stopReason, entryId);
    }
  });

  transaction();

  // Delete old files from disk after transaction succeeds
  for (const old of oldImages) {
    const fullPath = path.resolve(process.cwd(), "data", old.file_path);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch {}
  }
}
