import { Trash2, ExternalLink } from "lucide-react";
import type { EntryImage } from "../../types/entry";

interface SectionListProps {
  images: EntryImage[];
  title: string;
  onDeleteImage?: (imageId: string) => void;
  isDeletingImageId?: string | null;
}

export default function SectionList({
  images,
  title,
  onDeleteImage,
  isDeletingImageId,
}: SectionListProps) {
  if (!images || images.length === 0) {
    return (
      <div className="p-16 text-center border border-dashed border-border/80 rounded-2xl text-ink-tertiary text-xs bg-surface-elevated/40">
        No screenshots captured yet.
      </div>
    );
  }

  const sorted = [...images].sort((a, b) => a.position - b.position);

  return (
    <div className="w-full bg-surface-elevated border border-border/80 rounded-2xl overflow-hidden shadow-md flex flex-col transition-all">
      {/* Studio Workbench Chrome Header */}
      <div className="px-4 py-2.5 bg-surface-sunken/60 border-b border-border/60 flex items-center justify-between text-xs text-ink-tertiary">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-border-strong/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-border-strong/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-border-strong/40" />
          <span className="ml-2 font-mono text-[11px] text-ink-secondary truncate max-w-sm">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span>{sorted.length} {sorted.length === 1 ? "section" : "sections"}</span>
        </div>
      </div>

      {/* Seamless image roll */}
      <div className="flex flex-col relative divide-y divide-transparent">
        {sorted.map((img) => (
          <div
            key={img.id}
            className="group relative w-full bg-black/5"
          >
            {/* Quick action buttons on image hover */}
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 flex items-center gap-1.5">
              <a
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 bg-surface/90 hover:bg-surface text-ink-secondary hover:text-ink border border-border/80 rounded-lg transition-colors shadow-xs"
                title="Open image in full resolution"
              >
                <ExternalLink size={13} />
              </a>

              {onDeleteImage && sorted.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteImage(img.id)}
                  disabled={isDeletingImageId === img.id}
                  className="p-1.5 bg-surface/90 hover:bg-danger text-ink-secondary hover:text-white border border-border/80 rounded-lg transition-colors shadow-xs"
                  title={`Delete slice ${img.position}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <img
              src={img.url}
              alt={`${title} - Slice ${img.position}`}
              loading="lazy"
              className="w-full h-auto block"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
