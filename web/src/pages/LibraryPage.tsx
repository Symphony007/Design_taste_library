import { useState } from "react";
import Header from "../components/common/Header";
import AddEntryBar from "../components/add-entry/AddEntryBar";
import EntryGrid from "../components/library/EntryGrid";
import EmptyState from "../components/library/EmptyState";
import ExportModal from "../components/common/ExportModal";
import { useEntries } from "../hooks/useEntries";
import { Loader2, Download, X, CheckSquare } from "lucide-react";

export default function LibraryPage() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportInitialScope, setExportInitialScope] = useState<"all" | "selected">("all");

  const { entries, isLoading, isError, error, refetch } = useEntries();

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(entries.map((e) => e.id)));
  }

  function handleClearSelection() {
    setSelectedIds(new Set());
  }

  function handleOpenExport(scope: "all" | "selected") {
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
          ) : (
            <EntryGrid
              entries={entries}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          )}
        </section>
      </main>

      {/* Floating Selection Bar for Export only */}
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
            <span>Select all ({entries.length})</span>
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
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        initialScope={exportInitialScope}
        totalImagesCount={entries.reduce((sum, e) => sum + (e.images?.length || 0), 0)}
        selectedImagesCount={entries.filter((e) => selectedIds.has(e.id)).reduce((sum, e) => sum + (e.images?.length || 0), 0)}
      />
    </div>
  );
}
