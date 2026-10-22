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
  // Extract hostname for compact label
  let hostname = "";
  try {
    hostname = new URL(entry.url).hostname.replace(/^www\./, "");
  } catch {
    hostname = entry.url;
  }

  return (
    <div
      className={`group relative block border rounded-sm overflow-hidden transition-all ${
        isSelected
          ? "border-accent ring-1 ring-accent bg-accent-light/10"
          : "border-border hover:border-border-strong bg-surface-elevated"
      }`}
    >
      {/* Checkbox Overlay */}
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
            src={entry.full_page_url}
            alt={entry.title}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        </div>

      {/* Metadata strip */}
      <div className="px-3.5 py-3 border-t border-border">
        <p className="text-sm font-medium text-ink truncate leading-tight">
          {entry.title}
        </p>
        <p className="text-xs text-ink-tertiary font-mono mt-1 truncate">
          {hostname}
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {entry.category && (
            <span className="text-[10px] uppercase tracking-widest text-ink-secondary">
              {entry.category}
            </span>
          )}
          {entry.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-mono text-ink-tertiary border border-border px-1.5 py-0.5 rounded-sm"
            >
              {tag}
            </span>
          ))}
          {entry.tags.length > 3 && (
            <span className="text-[10px] font-mono text-ink-tertiary">
              +{entry.tags.length - 3}
            </span>
          )}
        </div>
      </div>
    </Link>
    </div>
  );
}
