import fs from "node:fs";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import {
  createEntry,
  getEntryById,
  getEntryByUrl,
  addImageToEntry,
  type Entry,
  type EntryImage,
} from "../db/entries.js";
import { isSafeUrl } from "../capture/url-safety.js";

export const UPLOAD_LIMITS = {
  MAX_UPLOAD_FILES: 50,
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB per file
  MAX_TOTAL_UPLOAD_BYTES: 100 * 1024 * 1024, // 100 MB total per upload request
  ALLOWED_FORMATS: ["png", "jpeg", "webp"] as const,
  WEBP_QUALITY: 82,
} as const;

export class UploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = "UploadError";
    this.statusCode = statusCode;
  }
}

interface DecodedImage {
  buffer: Buffer; // WebP re-encoded buffer
  width: number;
  height: number;
}

/**
 * Verifies that a buffer is a valid image by strictly decoding it with sharp.
 * Re-encodes the image to WebP. Rejects anything that fails to decode or is not png/jpeg/webp.
 */
export async function decodeAndVerifyImage(
  buffer: Buffer,
  originalFilename: string
): Promise<DecodedImage> {
  if (buffer.length === 0) {
    throw new UploadError(`File '${originalFilename}' is empty.`, 400);
  }

  if (buffer.length > UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
    throw new UploadError(
      `File '${originalFilename}' (${sizeMb}MB) exceeds the maximum allowed file size of ${UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
      400
    );
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err: any) {
    throw new UploadError(
      `File '${originalFilename}' is not a valid image or failed to decode.`,
      400
    );
  }

  const format = (metadata.format || "").toLowerCase();
  const allowed = UPLOAD_LIMITS.ALLOWED_FORMATS as readonly string[];
  if (!allowed.includes(format)) {
    throw new UploadError(
      `Unsupported image format '${format}' for '${originalFilename}'. Only PNG, JPEG, and WebP are accepted.`,
      400
    );
  }

  const width = metadata.width || 1440;
  const height = metadata.height || 900;

  try {
    const webpBuffer = await sharp(buffer)
      .webp({ quality: UPLOAD_LIMITS.WEBP_QUALITY })
      .toBuffer();

    return {
      buffer: webpBuffer,
      width,
      height,
    };
  } catch (err: any) {
    throw new UploadError(
      `Failed to process and encode image '${originalFilename}': ${err.message || err}`,
      400
    );
  }
}

/**
 * Creates a brand-new entry from one or more uploaded/pasted screenshot files.
 */
export async function createEntryFromUploadedFiles(
  files: Express.Multer.File[],
  input: { title?: string; sourceUrl?: string; notes?: string }
): Promise<Entry> {
  if (!files || files.length === 0) {
    throw new UploadError("Please provide either a URL to capture or at least one screenshot.", 400);
  }

  if (files.length > UPLOAD_LIMITS.MAX_UPLOAD_FILES) {
    throw new UploadError(
      `Too many files (${files.length}). Maximum allowed per entry is ${UPLOAD_LIMITS.MAX_UPLOAD_FILES}.`,
      400
    );
  }

  // Validate URL if provided
  let normalizedUrl: string | null = null;
  if (input.sourceUrl && input.sourceUrl.trim()) {
    const check = isSafeUrl(input.sourceUrl.trim());
    if (!check.safe || !check.url) {
      throw new UploadError(check.reason || "Invalid source URL.", 400);
    }
    normalizedUrl = check.url.toString();
    const existing = getEntryByUrl(normalizedUrl);
    if (existing) {
      throw new UploadError(`URL '${normalizedUrl}' has already been captured.`, 409);
    }
  }

  // Derive title: provided title -> first filename without extension -> "Untitled"
  let derivedTitle = (input.title || "").trim();
  if (!derivedTitle) {
    const firstFilename = files[0].originalname;
    const baseName = path.parse(firstFilename).name.trim();
    derivedTitle = baseName || "Untitled";
  }

  const entryId = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-user-${Math.random().toString(36).slice(2, 6)}`;
  const entryDir = path.resolve(process.cwd(), "data", "images", entryId);
  fs.mkdirSync(entryDir, { recursive: true });

  const stagedImages: Array<{
    id: string;
    position: number;
    file_path: string;
    width: number;
    height: number;
  }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const decoded = await decodeAndVerifyImage(file.buffer, file.originalname);

    const imageId = `img_${Date.now()}_${i + 1}_${Math.random().toString(36).slice(2, 6)}`;
    const filename = `${String(i + 1).padStart(2, "0")}-${imageId}.webp`;
    const destPath = path.resolve(entryDir, filename);

    fs.writeFileSync(destPath, decoded.buffer);

    stagedImages.push({
      id: imageId,
      position: i + 1,
      file_path: `images/${entryId}/${filename}`,
      width: decoded.width,
      height: decoded.height,
    });
  }

  const entry = createEntry({
    id: entryId,
    title: derivedTitle,
    source_url: normalizedUrl,
    notes: input.notes || null,
    images: stagedImages,
  });

  return entry;
}

/**
 * Appends uploaded screenshots to an existing entry.
 */
export async function appendImagesToEntry(
  entryId: string,
  files: Express.Multer.File[]
): Promise<EntryImage[]> {
  const existing = getEntryById(entryId);
  if (!existing) {
    throw new UploadError(`Entry '${entryId}' not found.`, 404);
  }

  if (!files || files.length === 0) {
    throw new UploadError("No images provided to upload.", 400);
  }

  const entryDir = path.resolve(process.cwd(), "data", "images", entryId);
  fs.mkdirSync(entryDir, { recursive: true });

  const addedImages: EntryImage[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const decoded = await decodeAndVerifyImage(file.buffer, file.originalname);

    const imageId = `img_${Date.now()}_${i + 1}_${Math.random().toString(36).slice(2, 6)}`;
    const filename = `${imageId}.webp`;
    const destPath = path.resolve(entryDir, filename);

    fs.writeFileSync(destPath, decoded.buffer);

    const img = addImageToEntry(entryId, {
      id: imageId,
      file_path: `images/${entryId}/${filename}`,
      width: decoded.width,
      height: decoded.height,
    });

    addedImages.push(img);
  }

  return addedImages;
}
