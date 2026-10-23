import fs from "node:fs";
import path from "node:path";
import { captureUrl, type CaptureResult } from "../capture/index.js";
import { isSafeUrl } from "../capture/url-safety.js";
import {
  createEntry,
  getEntryByUrl,
  updateEntry,
  type Entry,
} from "../db/entries.js";

/**
 * Custom operational error with HTTP status codes for the API layer.
 */
export class ServiceError extends Error {
  statusCode: number;
  data?: any;

  constructor(message: string, statusCode: number, data?: any) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

// Concurrency mutex: enforces single-capture execution to prevent resource starvation
let isCapturing = false;

/**
 * Normalizes a URL for consistent storage and duplicate checking.
 * Validates protocol (http/https only) and rejects private network/localhost addresses.
 */
export function normalizeUrl(rawUrl: string): string {
  const check = isSafeUrl(rawUrl);
  if (!check.safe || !check.url) {
    throw new ServiceError(check.reason || "Invalid or unsafe URL provided.", 400);
  }

  const parsed = check.url;
  // Strip trailing slashes from path for consistency
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

export interface CaptureAndSaveOptions {
  force?: boolean;
  notes?: string;
}

/**
 * Service orchestrating URL validation, duplicate guards, concurrency lock,
 * capture execution, atomic folder swapping for recaptures, and SQLite persistence.
 */
export async function captureAndCreateEntry(
  rawUrl: string,
  options?: CaptureAndSaveOptions
): Promise<Entry> {
  const targetUrl = normalizeUrl(rawUrl);

  // 1. Guard against concurrent captures
  if (isCapturing) {
    throw new ServiceError(
      "A capture is currently in progress. Please wait for it to finish.",
      429
    );
  }

  // 2. Guard against duplicate URLs
  const existing = getEntryByUrl(targetUrl);
  if (existing && !options?.force) {
    throw new ServiceError("URL has already been captured.", 409, {
      existingEntry: existing,
      message: "Pass 'force: true' to re-capture and overwrite.",
    });
  }

  isCapturing = true;

  const baseDir = path.resolve(process.cwd(), "data", "screenshots");
  const targetId = existing && options?.force ? existing.id : undefined;

  // Staging directories
  const tempSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const stagingDir = path.resolve(baseDir, `staging-${tempSuffix}`);
  let oldDirToRestore: string | null = null;
  let finalTargetDir: string | null = null;

  try {
    // 3. Run headless capture into staging directory
    let captureResult: CaptureResult;
    try {
      captureResult = await captureUrl(targetUrl, { targetDir: stagingDir });
    } catch (captureErr: any) {
      if (fs.existsSync(stagingDir)) {
        try {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch {}
      }
      throw new ServiceError(`Capture failed: ${captureErr.message || captureErr}`, 502);
    }

    const hostname = new URL(targetUrl).hostname;
    const finalTitle = (captureResult.title || "").trim() || hostname;

    // Determine final directory
    const finalId = targetId || captureResult.captureId;
    finalTargetDir = path.resolve(baseDir, finalId);
    const oldDir = path.resolve(baseDir, `${finalId}-old-${tempSuffix}`);

    // Verify staging files exist
    const stagedFull = path.resolve(stagingDir, "full.png");
    const stagedThumb = path.resolve(stagingDir, "thumb.png");
    if (!fs.existsSync(stagedFull) || !fs.existsSync(stagedThumb)) {
      throw new Error("Staging directory missing required full.png or thumb.png");
    }

    // 4. Safe atomic folder swap
    // Move old folder aside, move new folder in, delete old folder after success
    try {
      if (fs.existsSync(finalTargetDir)) {
        fs.renameSync(finalTargetDir, oldDir);
        oldDirToRestore = oldDir;
      }
      fs.renameSync(stagingDir, finalTargetDir);
    } catch (swapErr: any) {
      // Revert swap if rename failed
      if (oldDirToRestore && fs.existsSync(oldDirToRestore) && !fs.existsSync(finalTargetDir)) {
        try {
          fs.renameSync(oldDirToRestore, finalTargetDir);
        } catch {}
      }
      throw new Error(`Failed to swap screenshot directory: ${swapErr.message || swapErr}`);
    }

    const finalFullPagePath = path.resolve(finalTargetDir, "full.png");

    // 5. Update or Create Database Record
    try {
      if (existing && options?.force) {
        const updated = updateEntry(existing.id, {
          notes: options.notes !== undefined ? options.notes : existing.notes,
        });

        if (!updated) {
          throw new Error(`Failed to update existing entry ${existing.id}`);
        }

        const { db } = await import("../db/index.js");
        db.prepare(`
          UPDATE entries
          SET full_page_path = ?, steps_dir = ?, captured_at = ?, title = ?
          WHERE id = ?
        `).run(
          finalFullPagePath,
          "",
          captureResult.capturedAt,
          finalTitle,
          existing.id
        );

        // Delete old directory after successful DB update
        if (oldDirToRestore && fs.existsSync(oldDirToRestore)) {
          fs.rmSync(oldDirToRestore, { recursive: true, force: true });
        }

        return {
          ...updated,
          title: finalTitle,
          full_page_path: finalFullPagePath,
          steps_dir: "",
          captured_at: captureResult.capturedAt,
        };
      }

      // New entry creation
      const newEntry = createEntry({
        id: finalId,
        url: targetUrl,
        title: finalTitle,
        notes: options?.notes ?? null,
        full_page_path: finalFullPagePath,
        steps_dir: "",
        captured_at: captureResult.capturedAt,
      });

      // Cleanup old directory if any existed
      if (oldDirToRestore && fs.existsSync(oldDirToRestore)) {
        fs.rmSync(oldDirToRestore, { recursive: true, force: true });
      }

      return newEntry;
    } catch (dbErr: any) {
      // Restore previous folder if database save fails
      if (oldDirToRestore && fs.existsSync(oldDirToRestore)) {
        if (fs.existsSync(finalTargetDir)) {
          try {
            fs.rmSync(finalTargetDir, { recursive: true, force: true });
          } catch {}
        }
        try {
          fs.renameSync(oldDirToRestore, finalTargetDir);
        } catch {}
      }
      throw new ServiceError(`Database save failed: ${dbErr.message || dbErr}`, 500);
    }
  } finally {
    // Release concurrency lock
    isCapturing = false;
  }
}
