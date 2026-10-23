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
  category?: string;
  tags?: string[];
  notes?: string;
}

/**
 * Service orchestrating URL validation, duplicate guards, concurrency lock,
 * capture execution, atomic rollback on failures, and SQLite persistence.
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
  let captureResult: CaptureResult | null = null;
  let targetDirToCleanOnFailure: string | null = null;

  try {
    // 3. Run the headless Chromium capture pipeline
    try {
      captureResult = await captureUrl(targetUrl);
      targetDirToCleanOnFailure = path.dirname(captureResult.fullPagePath);
    } catch (captureErr: any) {
      throw new ServiceError(
        `Capture failed: ${captureErr.message || captureErr}`,
        502
      );
    }

    // Determine final title: page title if non-empty, otherwise hostname
    const hostname = new URL(targetUrl).hostname;
    const finalTitle = (captureResult.title || "").trim() || hostname;

    // 4. Save to Database
    try {
      if (existing && options?.force) {
        // Remove old screenshots directory if it was under a different capture ID
        const oldDir = existing.steps_dir ? path.resolve(existing.steps_dir, "..") : null;
        if (oldDir && oldDir !== targetDirToCleanOnFailure && fs.existsSync(oldDir)) {
          fs.rmSync(oldDir, { recursive: true, force: true });
        }

        const updated = updateEntry(existing.id, {
          category: options.category !== undefined ? options.category : existing.category,
          tags: options.tags !== undefined ? options.tags : existing.tags,
          notes: options.notes !== undefined ? options.notes : existing.notes,
        });

        if (!updated) {
          throw new Error(`Failed to update existing entry ${existing.id}`);
        }

        // Update screenshot paths and capture timestamp
        const { db } = await import("../db/index.js");
        db.prepare(`
          UPDATE entries
          SET full_page_path = ?, steps_dir = ?, captured_at = ?, title = ?, full_page_unreliable = ?
          WHERE id = ?
        `).run(
          captureResult.fullPagePath,
          captureResult.stepsDir,
          captureResult.capturedAt,
          finalTitle,
          captureResult.fullPageUnreliable ? 1 : 0,
          existing.id
        );

        return {
          ...updated,
          title: finalTitle,
          full_page_path: captureResult.fullPagePath,
          steps_dir: captureResult.stepsDir,
          captured_at: captureResult.capturedAt,
          full_page_unreliable: captureResult.fullPageUnreliable,
        };
      }

      // New entry creation
      return createEntry({
        id: captureResult.captureId,
        url: targetUrl,
        title: finalTitle,
        category: options?.category ?? null,
        tags: options?.tags ?? [],
        notes: options?.notes ?? null,
        full_page_path: captureResult.fullPagePath,
        steps_dir: captureResult.stepsDir,
        captured_at: captureResult.capturedAt,
        full_page_unreliable: captureResult.fullPageUnreliable,
      });
    } catch (dbErr: any) {
      // Database failure after successful capture: rollback files
      if (targetDirToCleanOnFailure && fs.existsSync(targetDirToCleanOnFailure)) {
        fs.rmSync(targetDirToCleanOnFailure, { recursive: true, force: true });
      }
      throw new ServiceError(`Database save failed: ${dbErr.message || dbErr}`, 500);
    }
  } catch (error: any) {
    // If capture failed halfway and left partial files behind, ensure cleanup
    if (targetDirToCleanOnFailure && fs.existsSync(targetDirToCleanOnFailure)) {
      try {
        fs.rmSync(targetDirToCleanOnFailure, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
    throw error;
  } finally {
    // Release concurrency lock
    isCapturing = false;
  }
}
