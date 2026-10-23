/**
 * Entry shape returned by the API.
 */
export interface Entry {
  id: string;
  url: string;
  title: string;
  notes: string | null;
  captured_at: string;
  full_page_url: string;
  thumbnail_url?: string;
}

export interface UpdateEntryInput {
  notes?: string | null;
}
