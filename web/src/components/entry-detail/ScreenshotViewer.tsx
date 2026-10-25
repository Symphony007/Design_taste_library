import { Trash2 } from "lucide-react";
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
      <div className="p-12 text-center border border-dashed border-border rounded-sm text-ink-tertiary text-xs">
        No section screenshots captured yet.
      </div>
    );
  }

  const sorted = [...images].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-4">
      {sorted.map((img) => (
        <div
          key={img.id}
          className="group relative w-full bg-surface-elevated border border-border rounded-sm overflow-hidden shadow-sm"
        >
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            {onDeleteImage && (
              <button
                type="button"
                onClick={() => onDeleteImage(img.id)}
                disabled={isDeletingImageId === img.id}
                className="p-1.5 bg-surface/90 hover:bg-danger text-ink-secondary hover:text-white border border-border rounded-sm transition-colors"
                title={`Delete section ${img.position}`}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <img
            src={img.url}
            alt={`${title} - Section ${img.position}`}
            loading="lazy"
            className="w-full h-auto block"
          />
        </div>
      ))}
    </div>
  );
}
