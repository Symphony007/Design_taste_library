import { useState, useMemo } from "react";
import Header from "../components/common/Header";
import AddEntryBar from "../components/add-entry/AddEntryBar";
import FilterBar from "../components/library/FilterBar";
import EntryGrid from "../components/library/EntryGrid";
import EmptyState from "../components/library/EmptyState";
import ExportModal from "../components/common/ExportModal";
import { useEntries } from "../hooks/useEntries";
import { Loader2, Download, X, CheckSquare } from "lucide-react";

export default function LibraryPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportInitialScope, setExportInitialScope] = useState<"all" | "filtered" | "selected">("all");

  // Fetch all entries so FilterBar can aggregate all available categories and tags
  const { entries, isLoading, isError, error, refetch } = useEntries();

  // Filter in-memory for smooth instant feedback
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (activeCategory && entry.category !== activeCategory) {
        return false;
      }
      if (activeTag && !entry.tags.includes(activeTag)) {
        return false;
      }
      return true;
    });
  }, [entries, activeCategory, activeTag]);

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(filteredEntries.map((e) => e.id)));
  }

  function handleClearSelection() {
    setSelectedIds(new Set());
  }

  function handleOpenExport(scope: "all" | "filtered" | "selected") {
    setExportInitialScope(scope);
    setExportModalOpen(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-ink relative pb-20">
      <Header
        entryCount={entries.length}
        onExportClick={() => handleOpenExport(selectedIds.size > 0 ? "selected" : "all")}
      />

      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-8 space-y-8">
        {/* Add Entry Section */}
        <section className="max-w-2xl mx-auto">
          <AddEntryBar />
        </section>

        {/* Filters */}
        {entries.length > 0 && (
          <section className="pt-2">
            <FilterBar
              entries={entries}
              activeCategory={activeCategory}
              activeTag={activeTag}
              onCategoryChange={setActiveCategory}
              onTagChange={setActiveTag}
            />
          </section>
        )}

        {/* Content Section */}
        <section className="pt-2">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-ink-tertiary">
              <Loader2 size={24} className="animate-spin text-accent" />
              <p className="text-xs font-mono">Loading library...</p>
            </div>
          ) : isError ? (
            <div className="py-24 text-center space-y-3">
              <p className="text-sm text-danger">
                Failed to load library: {error?.message || "Unknown error"}
              </p>
              <button
                onClick={() => refetch()}
                className="px-3 py-1.5 border border-border rounded-sm text-xs text-ink hover:border-border-strong"
              >
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <EmptyState />
          ) : filteredEntries.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <p className="text-sm text-ink-secondary">
                No entries match the selected filters.
              </p>
              <button
                onClick={() => {
                  setActiveCategory(null);
                  setActiveTag(null);
                }}
                className="text-xs text-accent hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <EntryGrid
              entries={filteredEntries}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          )}
        </section>
      </main>

      {/* Floating Selection Bar */}
      {selectedIds.size > 0 && (
        <aside
          aria-label="Selection toolbar"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-ink text-surface px-5 py-3 rounded-full shadow-lg flex items-center gap-4 text-xs font-medium"
        >
          <span className="font-mono text-accent-light">
            {selectedIds.size} selected
          </span>

          <div className="h-4 w-px bg-surface/20" />

          <button
            type="button"
            onClick={handleSelectAll}
            className="text-surface/80 hover:text-surface transition-colors flex items-center gap-1.5"
          >
            <CheckSquare size={13} />
            <span>Select all ({filteredEntries.length})</span>
          </button>

          <button
            type="button"
            onClick={handleClearSelection}
            className="text-surface/80 hover:text-surface transition-colors flex items-center gap-1.5"
          >
            <X size={13} />
            <span>Clear</span>
          </button>

          <div className="h-4 w-px bg-surface/20" />

          <button
            type="button"
            onClick={() => handleOpenExport("selected")}
            className="bg-accent text-surface-elevated px-3 py-1.5 rounded-full hover:bg-accent/90 transition-colors flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>Export Skill</span>
          </button>
        </aside>
      )}

      {/* Export Modal */}
      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        totalCount={entries.length}
        filteredCount={filteredEntries.length}
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        activeCategory={activeCategory}
        activeTag={activeTag}
        initialScope={exportInitialScope}
      />
    </div>
  );
}
