import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
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
import {
  createEntryFromUploadedFiles,
  appendImagesToEntry,
  UploadError,
  UPLOAD_LIMITS,
} from "../services/upload-service.js";
import { createExportArchive } from "../services/export-service.js";

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.resolve(process.cwd(), "data", "images");

// Multer memory storage configuration for uploaded screenshots
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES,
    files: UPLOAD_LIMITS.MAX_UPLOAD_FILES,
  },
});

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve stored images statically
app.use("/images", express.static(IMAGES_DIR));

// Serving the built frontend depends ONLY on NODE_ENV === 'production'
const isProduction = process.env.NODE_ENV === "production";
const WEB_DIST_DIR = path.resolve(process.cwd(), "web", "dist");

if (isProduction) {
  app.use(express.static(WEB_DIST_DIR));
} else {
  // Friendly response in dev (even after web/dist has been built)
  app.get("/", (_req: Request, res: Response) => {
    res.type("text/plain").send("Taste API is running. Open http://localhost:5173 for the app.");
  });
}

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
 * Handles both JSON and multipart/form-data:
 * - If images are uploaded: creates entry from files (URL is optional, auto-capture is skipped)
 * - If only a URL is provided: runs section auto-capture
 * - If neither is provided: returns friendly 400 error
 */
app.post("/api/entries", upload.array("images", UPLOAD_LIMITS.MAX_UPLOAD_FILES), async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const { url, force, notes, title } = req.body || {};

  // Case 1: Screenshots provided (the main path)
  if (files.length > 0) {
    try {
      const entry = await createEntryFromUploadedFiles(files, {
        title: typeof title === "string" ? title : undefined,
        sourceUrl: typeof url === "string" ? url : undefined,
        notes: typeof notes === "string" ? notes : undefined,
      });

      res.status(201).json({
        entry: formatEntry(entry),
      });
      return;
    } catch (err: any) {
      const statusCode = err instanceof UploadError ? err.statusCode : 400;
      res.status(statusCode).json({ error: err.message || "Failed to process uploaded images." });
      return;
    }
  }

  // Case 2: URL provided -> auto-capture
  if (url && typeof url === "string" && url.trim()) {
    try {
      const { entry } = await captureAndCreateEntry(url.trim(), {
        force: Boolean(force),
        notes: typeof notes === "string" ? notes : undefined,
      });

      res.status(201).json({
        entry: formatEntry(entry),
      });
      return;
    } catch (err: any) {
      const statusCode = err instanceof ServiceError ? err.statusCode : 500;
      res.status(statusCode).json({
        error: err.message || "An unexpected error occurred during capture.",
        ...(err.data || {}),
      });
      return;
    }
  }

  // Case 3: Neither URL nor images provided
  res.status(400).json({
    error: "Please provide either a URL to capture or at least one screenshot.",
  });
});

/**
 * POST /api/entries/:id/images
 * Appends new screenshot files to an existing entry.
 */
app.post(
  "/api/entries/:id/images",
  upload.array("images", UPLOAD_LIMITS.MAX_UPLOAD_FILES),
  async (req: Request, res: Response) => {
    const entryId = String(req.params.id);
    const files = (req.files as Express.Multer.File[]) || [];

    if (files.length === 0) {
      res.status(400).json({ error: "No image files provided." });
      return;
    }

    try {
      await appendImagesToEntry(entryId, files);
      const updated = getEntryById(entryId);
      if (!updated) {
        res.status(404).json({ error: `Entry '${entryId}' not found.` });
        return;
      }

      res.status(201).json({
        entry: formatEntry(updated),
      });
    } catch (err: any) {
      const statusCode = err instanceof UploadError ? err.statusCode : 500;
      res.status(statusCode).json({ error: err.message || "Failed to append images." });
    }
  }
);

/**
 * GET /api/entries
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

// Production SPA catch-all fallback
if (isProduction) {
  app.get("*", (req: Request, res: Response, next: express.NextFunction) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/images")) {
      return next();
    }
    res.sendFile(path.join(WEB_DIST_DIR, "index.html"));
  });
}

// Centralized error handling middleware
app.use((err: any, _req: Request, res: Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        error: `File exceeds the maximum allowed file size of ${UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
      });
      return;
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({
        error: `Too many files. Maximum allowed per request is ${UPLOAD_LIMITS.MAX_UPLOAD_FILES}.`,
      });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  if (err && err.status) {
    res.status(err.status).json({ error: err.message || "Request failed." });
    return;
  }

  console.error("Unhandled server error:", err);
  res.status(500).json({ error: err?.message || "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Taste server running at http://localhost:${PORT}`);
});

