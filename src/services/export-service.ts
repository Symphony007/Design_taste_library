import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ZipArchive, type Archiver } from "archiver";
import { getEntryById, listEntries, type Entry } from "../db/entries.js";
import { getDirectionNotes } from "../db/settings.js";

export interface ExportOptions {
  scope?: "all" | "selected";
  entryIds?: string[];
  directionNotes?: string;
}

export interface ExportResult {
  archive: Archiver;
  entryCount: number;
  totalImagesCount: number;
  warnings: string[];
}

const SKILL_ROOT = "designer-taste-library";
const MAX_EXPORT_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 88;

/**
 * Generates a clean filename slug from title and URL.
 * Slugs never cut mid-word.
 */
function createSlug(entry: Entry, usedSlugs: Set<string>): string {
  let base = (entry.title || "").trim();
  if (!base && entry.source_url) {
    try {
      base = new URL(entry.source_url).hostname;
    } catch {
      base = "reference";
    }
  }

  let slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Never cut mid-word: trim to nearest word under 48 chars
  if (slug.length > 48) {
    const cut = slug.slice(0, 48);
    const lastDash = cut.lastIndexOf("-");
    slug = lastDash > 15 ? cut.slice(0, lastDash) : cut;
  }

  if (!slug) {
    slug = "reference";
  }

  let uniqueSlug = slug;
  let counter = 1;
  while (usedSlugs.has(uniqueSlug)) {
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }

  usedSlugs.add(uniqueSlug);
  return uniqueSlug;
}

/**
 * Creates a Claude skill ZIP archive.
 */
export async function createExportArchive(
  options: ExportOptions = {}
): Promise<ExportResult> {
  const warnings: string[] = [];

  let entries: Entry[] = [];
  if (options.scope === "selected" && Array.isArray(options.entryIds)) {
    for (const id of options.entryIds) {
      const entry = getEntryById(id);
      if (entry) {
        entries.push(entry);
      } else {
        warnings.push(`Selected entry '${id}' not found in database.`);
      }
    }
  } else {
    entries = listEntries();
  }

  // Sort entries alphabetically by title for a clean, deterministic index
  entries.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  const directionNotes =
    options.directionNotes !== undefined
      ? options.directionNotes.trim()
      : getDirectionNotes().trim();

  const archive = new ZipArchive({
    zlib: { level: 6 },
  });

  const slugMap = new Map<string, string>();
  const usedSlugs = new Set<string>();
  for (const entry of entries) {
    const slug = createSlug(entry, usedSlugs);
    slugMap.set(entry.id, slug);
  }

  // 1. Build SKILL.md
  let directionSection = "";
  if (directionNotes) {
    directionSection = `\n## Designer Direction Notes\n> ${directionNotes.split("\n").join("\n> ")}\n`;
  }

  const skillMdContent = `---
name: designer-taste-library
description: A curated library of reference website designs, visual styles, typography, layouts, and aesthetic direction. Use before designing UI to ensure tasteful, high-quality, and non-generic user interfaces.
---

# Design Taste & Reference Library

This skill provides a curated reference library representing the designer's personal taste and aesthetic standards. Each entry is a top-to-bottom sequence of section screenshots of one site, to be read in order. Use these references to guide your UI and web application designs.
${directionSection}
## Instructions for AI Agents
When tasked with designing, building, or styling web interfaces:
1. **Explore References First**: Read \`references/index.md\` first. Open only the few most relevant entries rather than all of them.
2. **Study, Don't Blindly Copy**: Analyze the reference images in \`assets/\` and read the architectural notes in \`references/entries/\`. Each entry is a top-to-bottom sequence of section screenshots of one site, to be read in order. Study layout, typography, color, spacing, and structure instead of copying.
3. **Avoid Generic AI Patterns**:
   - Do NOT use generic gradients (e.g. purple-to-blue hero glows).
   - Do NOT build clichéd template cards or floating glass cards unless the reference specifically calls for it.
   - Do NOT use harsh saturated primary colors without curation.
4. **Follow Designer Notes**: Where notes exist in an entry's reference markdown, treat them as explicit guidance on why this reference works and how to apply similar principles.
`;

  archive.append(skillMdContent, { name: `${SKILL_ROOT}/SKILL.md` });

  // 2. Build references/index.md
  let indexMdContent = `# Design Reference Index\n\n`;
  indexMdContent += `Total references: ${entries.length}\n\n`;

  if (entries.length === 0) {
    indexMdContent += `_The reference library is currently empty._\n`;
  } else {
    for (const entry of entries) {
      const slug = slugMap.get(entry.id)!;
      const urlText = entry.source_url ? ` (${entry.source_url})` : "";
      const notesSnippet = entry.notes ? ` — ${entry.notes.replace(/\s+/g, " ").slice(0, 150)}` : "";
      indexMdContent += `- [**${entry.title}**](entries/${slug}.md)${urlText}${notesSnippet}\n`;
    }
    indexMdContent += `\n`;
  }

  archive.append(indexMdContent, { name: `${SKILL_ROOT}/references/index.md` });

  let totalImagesCount = 0;

  // 3. Process each entry's images and individual markdown file
  for (const entry of entries) {
    const slug = slugMap.get(entry.id)!;
    const entryImageFiles: { filename: string; label: string }[] = [];

    const sortedImages = [...(entry.images || [])].sort((a, b) => a.position - b.position);

    for (let i = 0; i < sortedImages.length; i++) {
      const img = sortedImages[i];
      const diskPath = path.resolve(process.cwd(), "data", img.file_path);

      if (fs.existsSync(diskPath)) {
        try {
          const numStr = String(i + 1).padStart(2, "0");
          const filename = `${numStr}.jpg`;

          // Convert WebP to JPEG (quality 88, 4:4:4 chroma), max width 1280px with NO slicing
          const jpegBuffer = await sharp(diskPath)
            .resize({ width: MAX_EXPORT_IMAGE_WIDTH, withoutEnlargement: true })
            .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" })
            .toBuffer();

          archive.append(jpegBuffer, { name: `${SKILL_ROOT}/assets/${slug}/${filename}` });
          entryImageFiles.push({ filename, label: `Section ${i + 1}` });
          totalImagesCount++;
        } catch (err: unknown) {
          warnings.push(`Failed to convert image ${img.file_path} for '${entry.title}': ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        warnings.push(`Image file not found on disk: ${diskPath}`);
      }
    }

    // Build references/entries/<slug>.md
    let entryMd = `# ${entry.title}\n\n`;
    if (entry.source_url) {
      entryMd += `- **Source URL**: [${entry.source_url}](${entry.source_url})\n`;
    }
    entryMd += `- **Created**: ${entry.created_at}\n\n`;

    if (entry.notes && entry.notes.trim()) {
      entryMd += `## Designer Notes\n\n`;
      entryMd += `${entry.notes.trim()}\n\n`;
    }

    entryMd += `## Reference Visuals\n\n`;
    if (entryImageFiles.length === 0) {
      entryMd += `_No images available for this entry._\n`;
    } else {
      for (const imgFile of entryImageFiles) {
        entryMd += `### ${imgFile.label}\n\n`;
        entryMd += `![${imgFile.label}](../../assets/${slug}/${imgFile.filename})\n\n`;
      }
    }

    archive.append(entryMd, { name: `${SKILL_ROOT}/references/entries/${slug}.md` });
  }

  return {
    archive,
    entryCount: entries.length,
    totalImagesCount,
    warnings,
  };
}
