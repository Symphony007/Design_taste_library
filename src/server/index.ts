import express, { type Request, type Response } from "express";
import path from "node:path";
import {
  listEntries,
  getEntryById,
  updateEntry,
  deleteEntry,
  deleteImage,
  type Entry,
} from "../db/entries.js";
import { getDirectionNotes, setDirectionNotes } from "../db/settings.js";
import {
  captureAndCreateEntry,
  ServiceError,
} from "../services/capture-service.js";
import { createExportArchive } from "../services/export-service.js";

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.resolve(process.cwd(), "data", "images");

// Middleware
app.use(express.json({ limit: "50mb" }));

// Serve stored images statically
app.use("/images", express.static(IMAGES_DIR));

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * Formats entry for client response, providing thumbnail_url from first image.
 */
function formatEntry(entry: Entry) {
  const sortedImages = [...(entry.images || [])].sort((a, b) => a.position - b.position);
  const firstImage = sortedImages[0];

  return {
    id: entry.id,
    title: entry.title,
    source_url: entry.source_url,
    notes: entry.notes,
    created_at: entry.created_at,
    stop_reason: entry.stop_reason,
    thumbnail_url: firstImage ? `/${firstImage.file_path}` : null,
    images: sortedImages.map((img) => ({
      id: img.id,
      position: img.position,
      url: `/${img.file_path}`,
      width: img.width,
      height: img.height,
    })),
  };
}

/**
 * POST /api/entries
 * Body: { url?: string, force?: boolean, notes?: string, title?: string }
 */
app.post("/api/entries", async (req: Request, res: Response) => {
  const { url, force, notes } = req.body || {};

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "A valid 'url' string is required in the request body." });
    return;
  }

  try {
    const { entry } = await captureAndCreateEntry(url, {
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
 * Returns list of entries, newest first.
 */
app.get("/api/entries", (_req: Request, res: Response) => {
  try {
    const entries = listEntries();
    res.json({ entries: entries.map(formatEntry) });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to retrieve entries: ${err.message || err}` });
  }
});

/**
 * GET /api/entries/:id
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
 * Updates title and/or notes.
 */
app.patch("/api/entries/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { title, notes } = req.body || {};

  try {
    const updated = updateEntry(id, {
      title: typeof title === "string" ? title.trim() : undefined,
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
 * Removes entry and all its image files from disk.
 */
app.delete("/api/entries/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const success = deleteEntry(id);
    if (!success) {
      res.status(404).json({ error: `Entry '${id}' not found.` });
      return;
    }

    res.json({ success: true, message: `Entry '${id}' deleted.` });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete entry '${id}': ${err.message || err}` });
  }
});

/**
 * DELETE /api/entries/:id/images/:imageId
 * Deletes a single image, removes file from disk, and compacts remaining positions.
 */
app.delete("/api/entries/:id/images/:imageId", (req: Request, res: Response) => {
  const entryId = String(req.params.id);
  const imageId = String(req.params.imageId);

  try {
    const success = deleteImage(entryId, imageId);
    if (!success) {
      res.status(404).json({ error: `Image '${imageId}' not found on entry '${entryId}'.` });
      return;
    }

    const updated = getEntryById(entryId);
    res.json({
      success: true,
      entry: updated ? formatEntry(updated) : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete image: ${err.message || err}` });
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
 * Generates and downloads the ZIP skill archive.
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
      res.status(500).json({ error: "Failed to export skill archive." });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Taste server running at http://localhost:${PORT}`);
});
