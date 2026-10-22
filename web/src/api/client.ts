/**
 * Centralized API client.
 * All fetch calls go through here so adding auth headers later
 * is a single-file change.
 */
import type { Entry, UpdateEntryInput } from "../types/entry";

const API_BASE = "/api";

class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      body.error || `Request failed (${res.status})`,
      res.status,
      body
    );
  }

  return body as T;
}

/* ─── Entries ─── */

interface EntriesResponse {
  entries: Entry[];
}

interface EntryResponse {
  entry: Entry;
}

export async function fetchEntries(filters?: {
  category?: string;
  tag?: string;
}): Promise<Entry[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.tag) params.set("tag", filters.tag);

  const qs = params.toString();
  const data = await request<EntriesResponse>(
    `/entries${qs ? `?${qs}` : ""}`
  );
  return data.entries;
}

export async function fetchEntry(id: string): Promise<Entry> {
  const data = await request<EntryResponse>(`/entries/${id}`);
  return data.entry;
}

export async function captureEntry(
  url: string,
  options?: { force?: boolean }
): Promise<Entry> {
  const data = await request<EntryResponse>("/entries", {
    method: "POST",
    body: JSON.stringify({ url, force: options?.force }),
  });
  return data.entry;
}

export async function updateEntry(
  id: string,
  updates: UpdateEntryInput
): Promise<Entry> {
  const data = await request<EntryResponse>(`/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return data.entry;
}

export async function deleteEntry(id: string): Promise<void> {
  await request(`/entries/${id}`, { method: "DELETE" });
}

/* ─── Settings & Export ─── */

export interface ExportOptions {
  scope: "all" | "filtered" | "selected";
  category?: string;
  tag?: string;
  entryIds?: string[];
  directionNotes?: string;
}

export async function fetchDirectionNotes(): Promise<string> {
  const data = await request<{ directionNotes: string }>("/settings/direction-notes");
  return data.directionNotes;
}

export async function saveDirectionNotes(directionNotes: string): Promise<string> {
  const data = await request<{ directionNotes: string }>("/settings/direction-notes", {
    method: "PATCH",
    body: JSON.stringify({ directionNotes }),
  });
  return data.directionNotes;
}

export async function downloadExport(options: ExportOptions): Promise<void> {
  const res = await fetch(`${API_BASE}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(
      errorBody.error || `Export failed with status ${res.status}`,
      res.status,
      errorBody
    );
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = "taste-skill.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}

/* ─── AI Suggestions ─── */

export interface AiSuggestionsResult {
  configured: boolean;
  category?: string;
  tags?: string[];
  description?: string;
  error?: string;
}

export async function fetchAiStatus(): Promise<{ configured: boolean }> {
  return request<{ configured: boolean }>("/ai/status");
}

export async function fetchAiSuggestions(entryId: string): Promise<AiSuggestionsResult> {
  return request<AiSuggestionsResult>(`/entries/${entryId}/ai-suggest`, {
    method: "POST",
  });
}

export { ApiError };


