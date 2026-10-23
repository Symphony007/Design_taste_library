import { ZipArchive, type Archiver } from "archiver";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getEntryById, listEntries, type Entry } from "../db/entries.js";
import { getDirectionNotes } from "../db/settings.js";

export const MAX_EXPORT_IMAGE_WIDTH = 1280;
export const SEGMENT_VIEWPORT_HEIGHT = 900;
export const JPEG_QUALITY = 82;

export interface ExportOptions {
  scope: "all" | "filtered" | "selected";
  category?: string;
  tag?: string;
  entryIds?: string[];
  directionNotes?: string;
}

export interface ExportResult {
  archive: Archiver;
  entryCount: number;
  warnings: string[];
}

/**
 * Generate a clean, unique slug for each entry.
 */
function createSlug(entry: Entry, existingSlugs: Set<string>): string {
  const base = entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "entry";

  let slug = base;
  let counter = 1;
  while (existingSlugs.has(slug)) {
    slug = `${base}-${counter++}`;
  }
  existingSlugs.add(slug);
  return slug;
}

/**
 * Build the Claude skill folder export archive.
 */
export async function createExportArchive(
  options: ExportOptions
): Promise<ExportResult> {
  const warnings: string[] = [];

  // Determine entries based on scope
  let entries: Entry[] = [];
  if (options.scope === "selected" && options.entryIds && options.entryIds.length > 0) {
    for (const id of options.entryIds) {
      const e = getEntryById(id);
      if (e) entries.push(e);
      else warnings.push(`Selected entry ID '${id}' was not found.`);
    }
  } else if (options.scope === "filtered") {
    entries = listEntries({
      category: options.category || undefined,
      tag: options.tag || undefined,
    });
  } else {
    // "all"
    entries = listEntries();
  }

  const directionNotes =
    options.directionNotes?.trim() || getDirectionNotes();

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
  const skillMdContent = `---
name: designer-taste-library
description: A curated library of reference website designs, visual styles, typography, layouts, and aesthetic direction. Use before designing UI to ensure tasteful, high-quality, and non-generic user interfaces.
---

# Design Taste & Reference Library

This skill provides a curated reference library representing the designer's personal taste and aesthetic standards. Use these references to guide your UI and web application designs.

## Designer Direction Notes
> ${directionNotes.split("\n").join("\n> ")}

## Instructions for AI Agents
When tasked with designing, building, or styling web interfaces:
1. **Explore References First**: Review the table of contents in \`references/index.md\` and select the most relevant entries matching the project's category and tags before writing code or CSS.
2. **Study, Don't Blindly Copy**: Analyze the reference images in \`assets/\` and read the architectural notes in \`references/entries/\`. Pay close attention to:
   - **Layout & Structure**: Grid rhythms, container widths, whitespace, and component composition.
   - **Typography**: Font pairings, weights, line heights, tracking, and optical hierarchy.
   - **Color & Contrast**: Restrained, harmonious palettes; intentional accent colors; subtle borders and surfaces.
   - **Micro-details**: Padding, border radii, shadows, and quiet UI elements.
3. **Avoid Generic AI Patterns**:
   - Do NOT use generic gradients (e.g. purple-to-blue hero glows).
   - Do NOT build clichéd template cards or floating glass cards unless the reference specifically calls for it.
   - Do NOT use harsh saturated primary colors without curation.
4. **Follow Designer Notes**: Where notes exist in an entry's reference markdown, treat them as explicit guidance on *why* this reference works and how to apply similar principles.
`;

  archive.append(skillMdContent, { name: "SKILL.md" });

  // 2. Build references/index.md
  const categorized = new Map<string, Entry[]>();
  for (const entry of entries) {
    const cat = entry.category?.trim() || "Uncategorized";
    const list = categorized.get(cat) || [];
    list.push(entry);
    categorized.set(cat, list);
  }

  let indexMdContent = `# Design Reference Index\n\n`;
  indexMdContent += `Total references: ${entries.length}\n\n`;

  if (entries.length === 0) {
    indexMdContent += `_The reference library is currently empty._\n`;
  } else {
    for (const [cat, catEntries] of Array.from(categorized.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      indexMdContent += `## ${cat}\n\n`;
      for (const entry of catEntries) {
        const slug = slugMap.get(entry.id)!;
        const tagsStr = entry.tags.length > 0 ? `\`${entry.tags.join("`, `")}\`` : "No tags";
        indexMdContent += `- [**${entry.title}**](entries/${slug}.md) — ${tagsStr}\n`;
      }
      indexMdContent += `\n`;
    }
  }

  archive.append(indexMdContent, { name: "references/index.md" });

  // Process each entry's images and markdown
  for (const entry of entries) {
    const slug = slugMap.get(entry.id)!;
    const entryImageFiles: { filename: string; label: string }[] = [];

    // Image processing: Full-page screenshot slicing & resizing
    // If the entry has full_page_unreliable set, skip full-page segments and export only steps
    if (!entry.full_page_unreliable) {
      if (entry.full_page_path && fs.existsSync(entry.full_page_path)) {
        try {
          const metadata = await sharp(entry.full_page_path).metadata();
          const width = metadata.width || 1440;
          const height = metadata.height || 900;

          if (height <= SEGMENT_VIEWPORT_HEIGHT * 1.25) {
            // Single segment is enough
            const buffer = await sharp(entry.full_page_path)
              .resize({ width: Math.min(width, MAX_EXPORT_IMAGE_WIDTH), withoutEnlargement: true })
              .jpeg({ quality: JPEG_QUALITY })
              .toBuffer();

            const filename = "full-page.jpg";
            archive.append(buffer, { name: `assets/${slug}/${filename}` });
            entryImageFiles.push({ filename, label: "Full page capture" });
          } else {
            // Slice into sequential viewport segments
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
              archive.append(segmentBuffer, { name: `assets/${slug}/${filename}` });
              entryImageFiles.push({ filename, label: `Full-page segment ${i + 1} of ${numSegments}` });
            }
          }
        } catch (err: unknown) {
          warnings.push(`Failed to process full-page image for '${entry.title}': ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        warnings.push(`Full-page screenshot not found for '${entry.title}' at ${entry.full_page_path}`);
      }
    }

    // Image processing: Stepped screenshots resizing
    if (entry.steps_dir && fs.existsSync(entry.steps_dir)) {
      try {
        const stepFiles = fs
          .readdirSync(entry.steps_dir)
          .filter((f) => f.endsWith(".png"))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        for (let i = 0; i < stepFiles.length; i++) {
          const stepFile = stepFiles[i];
          const fullPath = path.join(entry.steps_dir, stepFile);
          try {
            const stepBuffer = await sharp(fullPath)
              .resize({ width: MAX_EXPORT_IMAGE_WIDTH, withoutEnlargement: true })
              .jpeg({ quality: JPEG_QUALITY })
              .toBuffer();

            const stepNum = String(i + 1).padStart(2, "0");
            const filename = `step-${stepNum}.jpg`;
            archive.append(stepBuffer, { name: `assets/${slug}/${filename}` });
            entryImageFiles.push({ filename, label: `Viewport step ${i + 1} of ${stepFiles.length}` });
          } catch (err: unknown) {
            warnings.push(`Failed to process step image '${stepFile}' for '${entry.title}': ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err: unknown) {
        warnings.push(`Failed to read steps directory for '${entry.title}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Build references/entries/<slug>.md
    let entryMd = `# ${entry.title}\n\n`;
    entryMd += `- **Source URL**: [${entry.url}](${entry.url})\n`;
    entryMd += `- **Category**: ${entry.category || "Uncategorized"}\n`;
    entryMd += `- **Tags**: ${entry.tags.length > 0 ? entry.tags.map((t) => `\`${t}\``).join(", ") : "None"}\n`;
    entryMd += `- **Captured**: ${entry.captured_at}\n\n`;

    if (entry.full_page_unreliable) {
      entryMd += `> **Note**: This site is scroll-driven, so the reference visuals below are sequential viewport captures in order.\n\n`;
    }

    if (entry.notes && entry.notes.trim()) {
      entryMd += `## Designer Direction & Notes\n\n`;
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

    archive.append(entryMd, { name: `references/entries/${slug}.md` });
  }

  return {
    archive,
    entryCount: entries.length,
    warnings,
  };
}
