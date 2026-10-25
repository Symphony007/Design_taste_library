/**
 * Section image shape returned by the API.
 */
export interface EntryImage {
  id: string;
  position: number;
  url: string;
  width: number;
  height: number;
}

/**
 * Entry shape returned by the API.
 */
export interface Entry {
  id: string;
  title: string;
  source_url: string | null;
  notes: string | null;
  created_at: string;
  stop_reason: string | null;
  thumbnail_url: string | null;
  images: EntryImage[];
}

export interface UpdateEntryInput {
  title?: string;
  notes?: string | null;
}
