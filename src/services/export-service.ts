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
  warnings: string[];
}

const SKILL_ROOT = "designer-taste-library";
const MAX_EXPORT_IMAGE_WIDTH = 1280;
const SEGMENT_VIEWPORT_HEIGHT = 900;
const JPEG_QUALITY = 82;

/**
 * Generates a clean filename slug from title and URL.
 */
function createSlug(entry: Entry, usedSlugs: Set<string>): string {
  let base = (entry.title || "").trim();
  if (!base) {
    try {
      base = new URL(entry.url).hostname;
    } catch {
      base = "reference";
    }
  }

  let slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

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
 * Follows the Anthropic requirement that the ZIP contains a single root folder (designer-taste-library).
 */
export async function createExportArchive(
  options: ExportOptions = {}
): Promise<ExportResult> {
  const warnings: string[] = [];

  // Determine entries to include
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

  // Assign slugs
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

This skill provides a curated reference library representing the designer's personal taste and aesthetic standards. Use these references to guide your UI and web application designs.
${directionSection}
## Instructions for AI Agents
When tasked with designing, building, or styling web interfaces:
1. **Explore References First**: Review the table of contents in \`references/index.md\` and consult relevant reference entries in \`references/entries/\` before writing code or CSS.
2. **Study, Don't Blindly Copy**: Analyze the reference images in \`assets/\` and read the architectural notes in \`references/entries/\`. Pay close attention to:
   - **Layout & Structure**: Grid rhythms, container widths, whitespace, and component composition.
   - **Typography**: Font pairings, weights, line heights, tracking, and optical hierarchy.
   - **Color & Contrast**: Restrained, harmonious palettes; intentional accent colors; subtle borders and surfaces.
   - **Micro-details**: Padding, border radii, shadows, and quiet UI elements.
3. **Avoid Generic AI Patterns**:
   - Do NOT use generic gradients (e.g. purple-to-blue hero glows).
   - Do NOT build clichéd template cards or floating glass cards unless the reference specifically calls for it.
   - Do NOT use harsh saturated primary colors without curation.
4. **Follow Designer Notes**: Where notes exist in an entry's reference markdown, treat them as explicit guidance on why this reference works and how to apply similar principles.
`;

  archive.append(skillMdContent, { name: `${SKILL_ROOT}/SKILL.md` });

  // 2. Build references/index.md (Flat list)
  let indexMdContent = `# Design Reference Index\n\n`;
  indexMdContent += `Total references: ${entries.length}\n\n`;

  if (entries.length === 0) {
    indexMdContent += `_The reference library is currently empty._\n`;
  } else {
    for (const entry of entries) {
      const slug = slugMap.get(entry.id)!;
      indexMdContent += `- [**${entry.title}**](entries/${slug}.md)\n`;
    }
    indexMdContent += `\n`;
  }

  archive.append(indexMdContent, { name: `${SKILL_ROOT}/references/index.md` });

  // Process each entry's images and markdown
  for (const entry of entries) {
    const slug = slugMap.get(entry.id)!;
    const entryImageFiles: { filename: string; label: string }[] = [];

    // Slice full-page screenshot into segments for agent consumption
    if (entry.full_page_path && fs.existsSync(entry.full_page_path)) {
      try {
        const metadata = await sharp(entry.full_page_path).metadata();
        const width = metadata.width || 1440;
        const height = metadata.height || 900;

        if (height <= SEGMENT_VIEWPORT_HEIGHT * 1.25) {
          const buffer = await sharp(entry.full_page_path)
            .resize({ width: Math.min(width, MAX_EXPORT_IMAGE_WIDTH), withoutEnlargement: true })
            .jpeg({ quality: JPEG_QUALITY })
            .toBuffer();

          const filename = "full-page.jpg";
          archive.append(buffer, { name: `${SKILL_ROOT}/assets/${slug}/${filename}` });
          entryImageFiles.push({ filename, label: "Full page capture" });
        } else {
          const numSegments = Math.ceil(height / SEGMENT_VIEWPORT_HEIGHT);
          for (let i = 0; i < numSegments; i++) {
            const top = i * SEGMENT_VIEWPORT_HEIGHT;
            const segmentHeight = Math.min(SEGMENT_VIEWPORT_HEIGHT, height - top);
            if (segmentHeight <= 0) continue;

            const segmentBuffer = await sharp(entry.full_page_path)
              .extract({ left: 0, top, width, height: segmentHeight })
              .resize({ width: Math.min(width, MAX_EXPORT_IMAGE_WIDTH), withoutEnlargement: true })
              .jpeg({ quality: JPEG_QUALITY })
              .toBuffer();

            const segNum = String(i + 1).padStart(2, "0");
            const filename = `full-segment-${segNum}.jpg`;
            archive.append(segmentBuffer, { name: `${SKILL_ROOT}/assets/${slug}/${filename}` });
            entryImageFiles.push({ filename, label: `Full-page segment ${i + 1} of ${numSegments}` });
          }
        }
      } catch (err: unknown) {
        warnings.push(`Failed to process full-page image for '${entry.title}': ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      warnings.push(`Full-page screenshot not found for '${entry.title}' at ${entry.full_page_path}`);
    }

    // 3. Build references/entries/<slug>.md
    let entryMd = `# ${entry.title}\n\n`;
    entryMd += `- **Source URL**: [${entry.url}](${entry.url})\n`;
    entryMd += `- **Captured**: ${entry.captured_at}\n\n`;

    if (entry.notes && entry.notes.trim()) {
      entryMd += `## Designer Notes\n\n`;
      entryMd += `${entry.notes.trim()}\n\n`;
    }

    entryMd += `## Reference Visuals\n\n`;
    if (entryImageFiles.length === 0) {
      entryMd += `_No preview images available for this entry._\n`;
    } else {
      for (const img of entryImageFiles) {
        entryMd += `### ${img.label}\n\n`;
        entryMd += `![${img.label}](../../assets/${slug}/${img.filename})\n\n`;
      }
    }

    archive.append(entryMd, { name: `${SKILL_ROOT}/references/entries/${slug}.md` });
  }

  return {
    archive,
    entryCount: entries.length,
    warnings,
  };
}
