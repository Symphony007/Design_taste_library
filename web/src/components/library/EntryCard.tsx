import { Link } from "react-router-dom";
import { Check, Trash2 } from "lucide-react";
import type { Entry } from "../../types/entry";

interface EntryCardProps {
  entry: Entry;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDelete?: (id: string, title: string) => void;
}

export default function EntryCard({
  entry,
  isSelected = false,
  onToggleSelect,
  onDelete,
}: EntryCardProps) {
  let hostname = "";
  if (entry.source_url) {
    try {
      hostname = new URL(entry.source_url).hostname.replace(/^www\./, "");
    } catch {
      hostname = entry.source_url;
    }
  }

  const thumbnailSrc = entry.thumbnail_url || (entry.images && entry.images[0]?.url) || "";

  return (
    <div
      className={`group relative block border rounded-sm overflow-hidden transition-all ${
        isSelected
          ? "border-accent ring-1 ring-accent bg-accent-light/10"
          : "border-border hover:border-border-strong bg-surface-elevated"
      }`}
    >
      {/* Checkbox Overlay for multi-select */}
      {onToggleSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(entry.id);
          }}
          aria-label={isSelected ? `Deselect ${entry.title}` : `Select ${entry.title}`}
          className={`absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded-sm flex items-center justify-center border transition-all ${
            isSelected
              ? "bg-accent border-accent text-surface-elevated"
              : "bg-surface/85 border-border text-transparent opacity-0 group-hover:opacity-100 hover:border-border-strong"
          }`}
        >
          <Check size={13} className={isSelected ? "opacity-100" : "opacity-0"} />
        </button>
      )}

      {/* Delete button on hover */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(entry.id, entry.title);
          }}
          aria-label={`Delete ${entry.title}`}
          title="Delete entry"
          className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-sm flex items-center justify-center border border-border bg-surface/90 backdrop-blur text-ink-tertiary hover:text-danger hover:border-danger/40 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 size={12} />
        </button>
      )}

      <Link
        to={`/entry/${entry.id}`}
        className="block no-underline text-inherit"
      >
        {/* Screenshot thumbnail */}
        <div className="aspect-video bg-border/30 overflow-hidden">
          <img
            src={thumbnailSrc}
            alt={entry.title}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        </div>

        {/* Card info */}
        <div className="px-3.5 py-3 border-t border-border">
          <p className="text-sm font-medium text-ink truncate leading-tight">
            {entry.title}
          </p>
          <p className="text-xs text-ink-tertiary font-mono mt-1 truncate">
            {hostname}
          </p>
          {entry.notes && entry.notes.trim() && (
            <p className="text-xs text-ink-secondary mt-2 line-clamp-2 leading-relaxed">
              {entry.notes.trim()}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}
