import { useMemo } from "react";
import { X } from "lucide-react";
import type { Entry } from "../../types/entry";

interface FilterBarProps {
  entries: Entry[];
  activeCategory: string | null;
  activeTag: string | null;
  onCategoryChange: (category: string | null) => void;
  onTagChange: (tag: string | null) => void;
}

export default function FilterBar({
  entries,
  activeCategory,
  activeTag,
  onCategoryChange,
  onTagChange,
}: FilterBarProps) {
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.category) set.add(e.category);
    }
    return Array.from(set).sort();
  }, [entries]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      for (const t of e.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [entries]);

  if (categories.length === 0 && tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {categories.length > 0 && (
        <>
          <span className="text-ink-tertiary mr-1">Category</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() =>
                onCategoryChange(activeCategory === cat ? null : cat)
              }
              className={`px-2.5 py-1 border rounded-sm transition-colors ${
                activeCategory === cat
                  ? "border-accent text-accent bg-accent-light"
                  : "border-border text-ink-secondary hover:border-border-strong"
              }`}
            >
              {cat}
            </button>
          ))}
        </>
      )}

      {tags.length > 0 && (
        <>
          <span className="text-ink-tertiary mr-1 ml-2">Tag</span>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagChange(activeTag === tag ? null : tag)}
              className={`px-2.5 py-1 border rounded-sm font-mono transition-colors ${
                activeTag === tag
                  ? "border-accent text-accent bg-accent-light"
                  : "border-border text-ink-secondary hover:border-border-strong"
              }`}
            >
              {tag}
            </button>
          ))}
        </>
      )}

      {(activeCategory || activeTag) && (
        <button
          onClick={() => {
            onCategoryChange(null);
            onTagChange(null);
          }}
          className="ml-2 text-ink-tertiary hover:text-ink flex items-center gap-1"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
