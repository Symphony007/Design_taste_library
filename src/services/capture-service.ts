import fs from "node:fs";
import path from "node:path";
import { captureSections, type SectionCaptureResult } from "../capture/index.js";
import { isSafeUrl } from "../capture/url-safety.js";
import {
  createEntry,
  getEntryByUrl,
  replaceEntryImages,
  type Entry,
} from "../db/entries.js";

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

// Concurrency mutex: one capture at a time
let isCapturing = false;

export function normalizeUrl(rawUrl: string): string {
  const check = isSafeUrl(rawUrl);
  if (!check.safe || !check.url) {
    throw new ServiceError(check.reason || "Invalid or unsafe URL provided.", 400);
  }

  const parsed = check.url;
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

export interface CaptureAndCreateOptions {
  force?: boolean;
  notes?: string;
  onProgress?: (msg: string) => void;
}

export async function captureAndCreateEntry(
  rawUrl: string,
  options?: CaptureAndCreateOptions
): Promise<{ entry: Entry; captureResult: SectionCaptureResult }> {
  const normalizedUrl = normalizeUrl(rawUrl);

  const existing = getEntryByUrl(normalizedUrl);
  if (existing && !options?.force) {
    throw new ServiceError("URL has already been captured.", 409, {
      existingEntry: existing,
      message: "Pass 'force: true' to re-capture and overwrite.",
    });
  }

  if (isCapturing) {
    throw new ServiceError("Another capture is currently in progress. Please wait a moment.", 429);
  }

  isCapturing = true;

  // Staging folder for atomic operations
  const stagingId = `staging-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const stagingDir = path.resolve(process.cwd(), "data", "staging", stagingId);
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    const captureResult = await captureSections(normalizedUrl, {
      onProgress: options?.onProgress,
    });

    if (captureResult.sections.length === 0) {
      throw new ServiceError("No visual sections could be captured from this URL.", 502);
    }

    // Write sections into staging directory as WebP
    const stagedImages: Array<{
      id: string;
      position: number;
      filename: string;
      stagingPath: string;
      width: number;
      height: number;
    }> = [];

    for (let i = 0; i < captureResult.sections.length; i++) {
      const section = captureResult.sections[i];
      const imageId = `img_${Date.now()}_${i + 1}_${Math.random().toString(36).slice(2, 6)}`;
      const filename = `${String(i + 1).padStart(2, "0")}-${imageId}.webp`;
      const stagingFilePath = path.resolve(stagingDir, filename);

      fs.writeFileSync(stagingFilePath, section.buffer);

      stagedImages.push({
        id: imageId,
        position: i + 1,
        filename,
        stagingPath: stagingFilePath,
        width: section.width,
        height: section.height,
      });
    }

    const entryId = existing ? existing.id : captureResult.captureId;
    const finalImagesDir = path.resolve(process.cwd(), "data", "images", entryId);

    // Ensure target folder exists
    fs.mkdirSync(finalImagesDir, { recursive: true });

    // Move staged files into target directory
    const finalDbImages = stagedImages.map((img) => {
      const destPath = path.resolve(finalImagesDir, img.filename);
      fs.renameSync(img.stagingPath, destPath);
      return {
        id: img.id,
        position: img.position,
        file_path: `images/${entryId}/${img.filename}`,
        width: img.width,
        height: img.height,
      };
    });

    const stopReasonText = captureResult.stopReasonText;

    let entry: Entry;
    if (existing) {
      // Recapture: replace images and stop_reason
      replaceEntryImages(existing.id, finalDbImages, stopReasonText);
      entry = {
        ...existing,
        title: captureResult.title || existing.title,
        stop_reason: stopReasonText,
        images: finalDbImages.map((img) => ({
          ...img,
          entry_id: existing.id,
        })),
      };
    } else {
      entry = createEntry({
        id: entryId,
        title: captureResult.title || normalizedUrl,
        source_url: normalizedUrl,
        notes: options?.notes || null,
        stop_reason: stopReasonText,
        images: finalDbImages,
      });
    }

    return { entry, captureResult };
  } catch (err: any) {
    console.error(`[Capture Error] Failed capturing ${rawUrl}:`, err);
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(
      `Capture failed: ${err.message || "Failed to load and capture page."}`,
      502
    );
  } finally {
    isCapturing = false;
    // Clean up staging directory if it still exists
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch {}
  }
}
