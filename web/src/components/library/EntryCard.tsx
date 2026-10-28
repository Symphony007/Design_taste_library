import { Link } from "react-router-dom";
import { Check, Trash2, ExternalLink, Layers } from "lucide-react";
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
  const imagesCount = entry.images?.length || 1;

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border bg-surface-elevated overflow-hidden transition-all duration-300 ${
        isSelected
          ? "border-ink ring-2 ring-ink/10 shadow-md bg-accent-light/30"
          : "border-border/80 hover:border-border-strong hover:shadow-xl hover:-translate-y-1 shadow-2xs"
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
          className={`absolute top-3 left-3 z-20 w-6 h-6 rounded-lg flex items-center justify-center border transition-all duration-200 backdrop-blur-md ${
            isSelected
              ? "bg-ink border-ink text-surface shadow-xs"
              : "bg-surface/80 border-border/80 text-transparent opacity-0 group-hover:opacity-100 hover:border-ink hover:text-ink/40 shadow-xs"
          }`}
        >
          <Check size={13} strokeWidth={2.5} className={isSelected ? "opacity-100" : "opacity-0"} />
        </button>
      )}

      {/* Floating Action Buttons on top-right hover */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
        {entry.source_url && (
          <a
            href={entry.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open live site"
            className="w-7 h-7 rounded-lg flex items-center justify-center border border-border/70 bg-surface/90 backdrop-blur-md text-ink-secondary hover:text-ink hover:bg-surface shadow-xs transition-colors"
          >
            <ExternalLink size={12} />
          </a>
        )}

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
            className="w-7 h-7 rounded-lg flex items-center justify-center border border-border/70 bg-surface/90 backdrop-blur-md text-ink-tertiary hover:text-danger hover:border-danger/30 hover:bg-surface shadow-xs transition-colors"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <Link
        to={`/entry/${entry.id}`}
        className="flex-1 flex flex-col no-underline text-inherit"
      >
        {/* Screenshot viewport frame */}
        <div className="aspect-[16/10] bg-surface-sunken overflow-hidden relative">
          <img
            src={thumbnailSrc}
            alt={entry.title}
            loading="lazy"
            className="w-full h-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 ring-1 ring-inset ring-black/5 pointer-events-none rounded-t-2xl" />

          {/* Screen count badge */}
          <div className="absolute bottom-2.5 right-2.5 z-10 px-2 py-0.5 rounded-md bg-surface/85 backdrop-blur-md border border-border/60 text-[10px] font-mono text-ink-secondary shadow-2xs flex items-center gap-1">
            <Layers size={10} className="text-ink-tertiary" />
            <span>{imagesCount} {imagesCount === 1 ? "screen" : "screens"}</span>
          </div>
        </div>

        {/* Card info footer */}
        <div className="p-4 flex-1 flex flex-col justify-between border-t border-border/60">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              {hostname && (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                  alt=""
                  className="w-3.5 h-3.5 rounded-full object-contain shrink-0 opacity-80"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              )}
              <span className="text-[11px] font-mono text-ink-tertiary truncate">
                {hostname || "reference"}
              </span>
            </div>

            <h3 className="text-sm font-semibold tracking-tight text-ink group-hover:text-ink/80 transition-colors line-clamp-1 leading-snug">
              {entry.title}
            </h3>
          </div>

          {entry.notes && entry.notes.trim() ? (
            <p className="text-xs text-ink-secondary mt-2.5 line-clamp-2 leading-relaxed bg-surface-sunken/50 p-2 rounded-lg border border-border/40 font-sans">
              {entry.notes.trim()}
            </p>
          ) : (
            <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[11px] text-ink-tertiary font-mono">
              <span>View details</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
