import express, { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import "../db/index.js";
import {
  deleteEntry,
  getEntryById,
  listEntries,
  updateEntry,
} from "../db/entries.js";
import {
  captureAndCreateEntry,
  ServiceError,
} from "../services/capture-service.js";
import { getDirectionNotes, setDirectionNotes } from "../db/settings.js";
import { createExportArchive } from "../services/export-service.js";
import { generateAiSuggestions, isAiTaggerConfigured } from "../services/ai-tagger-service.js";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "data", "screenshots");

app.use(express.json());

// Serve static frontend files from public/
app.use(express.static(PUBLIC_DIR));

// Serve screenshots directory statically so images are reachable via /screenshots/...
app.use("/screenshots", express.static(SCREENSHOTS_DIR));

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * POST /api/entries
 * Takes { url: string, force?: boolean, category?: string, tags?: string[], notes?: string }
 * Validates the URL, executes headless capture, saves entry, and returns 201 Created.
 */
app.post("/api/entries", async (req: Request, res: Response) => {
  const { url, force, category, tags, notes } = req.body || {};

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "A valid 'url' string is required in the request body." });
    return;
  }

  try {
    const entry = await captureAndCreateEntry(url, {
      force: Boolean(force),
      category: typeof category === "string" ? category : undefined,
      tags: Array.isArray(tags) ? tags : undefined,
      notes: typeof notes === "string" ? notes : undefined,
    });

    res.status(201).json({
      entry: {
        ...entry,
        full_page_url: `/screenshots/${entry.id}/full.png`,
        steps_url: `/screenshots/${entry.id}/steps`,
      },
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
 * Supports optional ?category= and ?tag= query filters.
 */
app.get("/api/entries", (req: Request, res: Response) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;

  try {
    const entries = listEntries({ category, tag });
    const formatted = entries.map((entry) => ({
      ...entry,
      full_page_url: `/screenshots/${entry.id}/full.png`,
      steps_url: `/screenshots/${entry.id}/steps`,
    }));

    res.json({ entries: formatted });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to retrieve entries: ${err.message || err}` });
  }
});

/**
 * GET /api/entries/:id
 * Fetches one entry, including full list of step image URLs and file paths.
 */
app.get("/api/entries/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const entry = getEntryById(id);
    if (!entry) {
      res.status(404).json({ error: `Entry '${id}' not found.` });
      return;
    }

    // Scan steps directory for numbered step screenshots
    let stepImages: string[] = [];
    if (entry.steps_dir && fs.existsSync(entry.steps_dir)) {
      try {
        const files = fs.readdirSync(entry.steps_dir);
        stepImages = files
          .filter((f) => f.endsWith(".png"))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map((f) => `/screenshots/${entry.id}/steps/${f}`);
      } catch {
        stepImages = [];
      }
    }

    res.json({
      entry: {
        ...entry,
        full_page_url: `/screenshots/${entry.id}/full.png`,
        steps_url: `/screenshots/${entry.id}/steps`,
        step_images: stepImages,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch entry '${id}': ${err.message || err}` });
  }
});

/**
 * PATCH /api/entries/:id
 * Updates category, tags, notes only.
 */
app.patch("/api/entries/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { category, tags, notes } = req.body || {};

  if (tags !== undefined && !Array.isArray(tags)) {
    res.status(400).json({ error: "'tags' must be an array of strings." });
    return;
  }

  try {
    const updated = updateEntry(id, {
      category: category !== undefined ? category : undefined,
      tags: tags !== undefined ? tags : undefined,
      notes: notes !== undefined ? notes : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: `Entry '${id}' not found.` });
      return;
    }

    res.json({
      entry: {
        ...updated,
        full_page_url: `/screenshots/${updated.id}/full.png`,
        steps_url: `/screenshots/${updated.id}/steps`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to update entry '${id}': ${err.message || err}` });
  }
});

/**
 * DELETE /api/entries/:id
 * Removes entry from database and removes its screenshot files from disk.
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
    const captureDir = entry.steps_dir
      ? path.resolve(entry.steps_dir, "..")
      : path.resolve(SCREENSHOTS_DIR, id);

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
 * Body: { scope?: 'all' | 'filtered' | 'selected', category?: string, tag?: string, entryIds?: string[], directionNotes?: string }
 */
app.post("/api/export", async (req: Request, res: Response) => {
  try {
    const { scope = "all", category, tag, entryIds, directionNotes } = req.body || {};
    const { archive, warnings } = await createExportArchive({
      scope,
      category,
      tag,
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

/**
 * GET /api/ai/status
 */
app.get("/api/ai/status", (_req: Request, res: Response) => {
  res.json({ configured: isAiTaggerConfigured() });
});

/**
 * POST /api/entries/:id/ai-suggest
 */
app.post("/api/entries/:id/ai-suggest", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  if (!isAiTaggerConfigured()) {
    res.json({
      configured: false,
      error: "Anthropic API key is not configured. Set ANTHROPIC_API_KEY to enable AI tag suggestions.",
    });
    return;
  }

  try {
    const suggestions = await generateAiSuggestions(id);
    res.json(suggestions);
  } catch (err: any) {
    console.error(`AI tag suggestion failed for entry '${id}':`, err.message || err);
    res.status(500).json({
      configured: true,
      error: err.message || "Failed to generate AI tag suggestions.",
    });
  }
});

export const server = app.listen(PORT, () => {
  console.log(`Taste server running at http://localhost:${PORT}`);
});

export default app;
