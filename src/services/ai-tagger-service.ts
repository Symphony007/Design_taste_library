import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getEntryById } from "../db/entries.js";

export const STANDARD_CATEGORIES = [
  "portfolio",
  "SaaS/product landing",
  "e-commerce",
  "editorial/blog",
  "agency",
  "dashboard/product UI",
  "personal site",
  "experimental",
] as const;

export interface AiTagSuggestions {
  configured: boolean;
  category?: string;
  tags?: string[];
  description?: string;
  error?: string;
}

export function isAiTaggerConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0);
}

/**
 * Generates AI tag, category, and style description suggestions for an entry using Anthropic Vision.
 */
export async function generateAiSuggestions(entryId: string): Promise<AiTagSuggestions> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      error: "Anthropic API key is not configured. Set ANTHROPIC_API_KEY in your environment to enable AI suggestions.",
    };
  }

  const entry = getEntryById(entryId);
  if (!entry) {
    throw new Error(`Entry '${entryId}' not found.`);
  }

  // Gather stepped images, or fallback to full-page screenshot
  const imageBuffers: { mediaType: "image/jpeg"; data: string }[] = [];

  if (entry.steps_dir && fs.existsSync(entry.steps_dir)) {
    const stepFiles = fs
      .readdirSync(entry.steps_dir)
      .filter((f) => f.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .slice(0, 3); // Top 3 viewports

    for (const file of stepFiles) {
      try {
        const fullPath = path.join(entry.steps_dir, file);
        const resized = await sharp(fullPath)
          .resize({ width: 1000, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        imageBuffers.push({
          mediaType: "image/jpeg",
          data: resized.toString("base64"),
        });
      } catch (err) {
        console.error(`Failed to resize step image '${file}':`, err);
      }
    }
  }

  // If no step images could be loaded, try full page screenshot
  if (imageBuffers.length === 0 && entry.full_page_path && fs.existsSync(entry.full_page_path)) {
    try {
      const resized = await sharp(entry.full_page_path)
        .extract({ left: 0, top: 0, width: 1440, height: Math.min(1800, (await sharp(entry.full_page_path).metadata()).height || 900) })
        .resize({ width: 1000, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      imageBuffers.push({
        mediaType: "image/jpeg",
        data: resized.toString("base64"),
      });
    } catch (err) {
      console.error("Failed to process fallback screenshot:", err);
    }
  }

  if (imageBuffers.length === 0) {
    throw new Error("No screenshot images available to analyze.");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const contentPayload: any[] = imageBuffers.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mediaType,
      data: img.data,
    },
  }));

  contentPayload.push({
    type: "text",
    text: `You are an expert UI/web design critic and archivist analyzing website design screenshots for a designer's reference library.

Analyze the visual design, typography, layout, color palette, and interaction style shown in these screenshots for "${entry.title}" (${entry.url}).

Respond with a single valid JSON object strictly matching this schema:
{
  "category": string, // Best fit from: [${STANDARD_CATEGORIES.map((c) => `"${c}"`).join(", ")}] or custom if unique
  "tags": string[], // 3 to 6 concise, highly specific design tags (e.g. "editorial serif", "swiss grid", "restrained monochrome", "warm neutrals", "dense data")
  "description": string // 1 to 2 sentence succinct description of the visual style and aesthetic merit
}

Return ONLY raw JSON, with no code fences, markdown tags, or accompanying conversation.`,
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: contentPayload,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Anthropic API Error:", response.status, errorBody);
    throw new Error(`Anthropic API request failed (${response.status})`);
  }

  const data: any = await response.json();
  const textOutput = data.content?.[0]?.text || "{}";

  try {
    const cleaned = textOutput.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      configured: true,
      category: typeof parsed.category === "string" ? parsed.category : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).toLowerCase().trim()) : [],
      description: typeof parsed.description === "string" ? parsed.description : undefined,
    };
  } catch {
    console.error("Failed to parse Anthropic JSON response:", textOutput);
    throw new Error("Failed to parse design suggestions from AI response.");
  }
}
