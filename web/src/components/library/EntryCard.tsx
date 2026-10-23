import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import type { Entry } from "../../types/entry";

interface EntryCardProps {
  entry: Entry;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export default function EntryCard({
  entry,
  isSelected = false,
  onToggleSelect,
}: EntryCardProps) {
  let hostname = "";
  try {
    hostname = new URL(entry.url).hostname.replace(/^www\./, "");
  } catch {
    hostname = entry.url;
  }

  const thumbnailSrc = entry.thumbnail_url || entry.full_page_url;

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
