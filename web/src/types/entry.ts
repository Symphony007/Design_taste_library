/**
 * Entry shape returned by the API.
 * Mirrors the backend's Entry interface with added URL fields.
 */
export interface Entry {
  id: string;
  url: string;
  title: string;
  category: string | null;
  tags: string[];
  notes: string | null;
  full_page_path: string;
  steps_dir: string;
  captured_at: string;
  full_page_unreliable?: boolean;
  // Computed by the API layer
  full_page_url: string;
  steps_url: string;
  thumbnail_url?: string;
  step_images?: string[];
}

export interface UpdateEntryInput {
  category?: string | null;
  tags?: string[];
  notes?: string | null;
}
