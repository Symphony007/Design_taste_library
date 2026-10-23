import express, { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import "../db/index.js";
import {
  deleteEntry,
  getEntryById,
  listEntries,
  updateEntry,
  type Entry,
} from "../db/entries.js";
import {
  captureAndCreateEntry,
  ServiceError,
} from "../services/capture-service.js";
import { getDirectionNotes, setDirectionNotes } from "../db/settings.js";
import { createExportArchive } from "../services/export-service.js";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const WEB_DIST_DIR = path.resolve(process.cwd(), "web", "dist");
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "data", "screenshots");

app.use(express.json());

// Serve production frontend bundle from web/dist if built
if (fs.existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR));
}

// Serve screenshots directory statically so images are reachable via /screenshots/...
app.use("/screenshots", express.static(SCREENSHOTS_DIR));

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * Formats entry for client response, stripping unused fields and providing thumbnail URL.
 */
function formatEntry(entry: Entry) {
  const entryDir = path.resolve(SCREENSHOTS_DIR, entry.id);
  const thumbPath = path.resolve(entryDir, "thumb.png");
  const thumbExists = fs.existsSync(thumbPath);

  return {
    id: entry.id,
    url: entry.url,
    title: entry.title,
    notes: entry.notes,
    captured_at: entry.captured_at,
    full_page_url: `/screenshots/${entry.id}/full.png`,
    thumbnail_url: thumbExists
      ? `/screenshots/${entry.id}/thumb.png`
      : `/screenshots/${entry.id}/full.png`,
  };
}

/**
 * POST /api/entries
 * Takes { url: string, force?: boolean, notes?: string }
 */
app.post("/api/entries", async (req: Request, res: Response) => {
  const { url, force, notes } = req.body || {};

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "A valid 'url' string is required in the request body." });
    return;
  }

  try {
    const entry = await captureAndCreateEntry(url, {
      force: Boolean(force),
      notes: typeof notes === "string" ? notes : undefined,
    });

    res.status(201).json({
      entry: formatEntry(entry),
    });
  } catch (err: any) {
    const statusCode = err instanceof ServiceError ? err.statusCode : 500;
    res.status(statusCode).json({
      error: err.message || "An unexpected error occurred during capture.",
      ...(err.data || {}),
    });
  }
});

/**
 * GET /api/entries
 * Returns a list of all entries, newest first.
 */
app.get("/api/entries", (_req: Request, res: Response) => {
  try {
    const entries = listEntries();
    const formatted = entries.map(formatEntry);

    res.json({ entries: formatted });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to retrieve entries: ${err.message || err}` });
  }
});

/**
 * GET /api/entries/:id
 * Fetches one entry.
 */
app.get("/api/entries/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const entry = getEntryById(id);
    if (!entry) {
      res.status(404).json({ error: `Entry '${id}' not found.` });
      return;
    }

    res.json({
      entry: formatEntry(entry),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch entry '${id}': ${err.message || err}` });
  }
});

/**
 * PATCH /api/entries/:id
 * Updates notes.
 */
app.patch("/api/entries/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { notes } = req.body || {};

  try {
    const updated = updateEntry(id, {
      notes: typeof notes === "string" ? notes : null,
    });

    if (!updated) {
      res.status(404).json({ error: `Entry '${id}' not found.` });
      return;
    }

    res.json({
      entry: formatEntry(updated),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to update entry '${id}': ${err.message || err}` });
  }
});

/**
 * DELETE /api/entries/:id
 * Removes entry from database and removes its screenshot folder from disk.
 */
app.delete("/api/entries/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const entry = getEntryById(id);
    if (!entry) {
      res.status(404).json({ error: `Entry '${id}' not found.` });
      return;
    }

    // 1. Delete from database
    deleteEntry(id);

    // 2. Delete screenshot files and folder from disk
    const captureDir = path.resolve(SCREENSHOTS_DIR, id);
    if (fs.existsSync(captureDir)) {
      try {
        fs.rmSync(captureDir, { recursive: true, force: true });
      } catch (rmErr: any) {
        console.error(`Warning: could not delete files for entry '${id}':`, rmErr);
      }
    }

    res.json({ ok: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete entry '${id}': ${err.message || err}` });
  }
});

/**
 * GET /api/settings/direction-notes
 */
app.get("/api/settings/direction-notes", (_req: Request, res: Response) => {
  res.json({ directionNotes: getDirectionNotes() });
});

/**
 * PATCH /api/settings/direction-notes
 */
app.patch("/api/settings/direction-notes", (req: Request, res: Response) => {
  const { directionNotes } = req.body || {};
  if (typeof directionNotes !== "string") {
    res.status(400).json({ error: "'directionNotes' string is required." });
    return;
  }
  setDirectionNotes(directionNotes.trim());
  res.json({ directionNotes: getDirectionNotes() });
});

/**
 * POST /api/export
 * Body: { scope?: 'all' | 'selected', entryIds?: string[], directionNotes?: string }
 */
app.post("/api/export", async (req: Request, res: Response) => {
  try {
    const { scope = "all", entryIds, directionNotes } = req.body || {};
    const { archive, warnings } = await createExportArchive({
      scope,
      entryIds,
      directionNotes,
    });

    res.attachment("taste-skill.zip");
    res.setHeader("Content-Type", "application/zip");
    if (warnings.length > 0) {
      res.setHeader("X-Export-Warnings", encodeURIComponent(JSON.stringify(warnings)));
    }

    archive.on("error", (err: any) => {
      console.error("Export archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate zip archive." });
      }
    });

    archive.pipe(res);
    await archive.finalize();
  } catch (err: any) {
    console.error("Export error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to generate export." });
    }
  }
});

export const server = app.listen(PORT, () => {
  console.log(`Taste server running at http://localhost:${PORT}`);
});

export default app;
