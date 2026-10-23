import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Trash2, Loader2, Calendar, Info } from "lucide-react";
import Header from "../components/common/Header";
import Modal from "../components/common/Modal";
import ViewToggle from "../components/entry-detail/ViewToggle";
import ScreenshotViewer from "../components/entry-detail/ScreenshotViewer";
import EntryMetadataEditor from "../components/entry-detail/EntryMetadataEditor";
import { useEntry } from "../hooks/useEntry";

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<"full" | "steps">("full");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const {
    entry,
    isLoading,
    isError,
    error,
    updateEntryAsync,
    isUpdating,
    deleteEntry,
    isDeleting,
  } = useEntry(id);

  // Default to Steps view if this site locks page scrolling
  useEffect(() => {
    if (entry?.full_page_unreliable) {
      setView("steps");
    }
  }, [entry?.full_page_unreliable]);

  async function handleDeleteConfirm() {
    try {
      await deleteEntry();
      setDeleteModalOpen(false);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // Format captured date
  const capturedDate = entry?.captured_at
    ? new Date(entry.captured_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className="min-h-screen flex flex-col bg-surface text-ink">
      <Header />

      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-6 space-y-6">
        {/* Navigation & Actions Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-mono text-ink-secondary hover:text-ink transition-colors no-underline"
          >
            <ArrowLeft size={14} />
            <span>Back to library</span>
          </Link>

          {entry && (
            <div className="flex items-center gap-3">
              <ViewToggle
                view={view}
                onViewChange={setView}
                stepCount={entry.step_images?.length}
                fullPageDisabled={Boolean(entry.full_page_unreliable)}
              />

              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-secondary hover:text-danger hover:border-danger/30 border border-border rounded-sm transition-colors"
                title="Delete entry"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          )}
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-3 text-ink-tertiary">
            <Loader2 size={24} className="animate-spin text-accent" />
            <p className="text-xs font-mono">Loading capture details...</p>
          </div>
        ) : isError || !entry ? (
          <div className="py-32 text-center space-y-4">
            <p className="text-base text-ink font-medium">Entry not found</p>
            <p className="text-xs text-ink-secondary">
              {error?.message || "The requested entry does not exist or may have been deleted."}
            </p>
            <Link
              to="/"
              className="inline-block px-4 py-2 border border-border rounded-sm text-xs font-medium text-ink hover:border-border-strong no-underline"
            >
              Return to library
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Entry Header Info */}
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                {entry.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-xs text-ink-tertiary">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-ink-secondary hover:text-accent font-mono truncate max-w-lg no-underline"
                >
                  <span>{entry.url}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
                {capturedDate && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Calendar size={12} />
                    <span>Captured on {capturedDate}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Layout: Viewer on left/main, Metadata editor alongside or below */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Screenshots display */}
              <div className="lg:col-span-8 order-2 lg:order-1 space-y-4">
                {entry.full_page_unreliable && (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-sm border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
                    <Info size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>This site locks page scrolling, so Steps is the accurate view.</span>
                  </div>
                )}
                <ScreenshotViewer
                  view={view}
                  fullPageUrl={entry.full_page_url}
                  title={entry.title}
                  stepImages={entry.step_images}
                />
              </div>

              {/* Metadata & Notes sidebar */}
              <div className="lg:col-span-4 order-1 lg:order-2 lg:sticky lg:top-6">
                <EntryMetadataEditor
                  entry={entry}
                  onUpdate={updateEntryAsync}
                  isUpdating={isUpdating}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-ink">
            Delete this entry?
          </h3>
          <p className="text-xs text-ink-secondary leading-relaxed">
            This will permanently remove <span className="font-medium text-ink font-mono">{entry?.title}</span> along with all full-page and stepped screenshots. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setDeleteModalOpen(false)}
              className="px-3.5 py-1.5 text-xs text-ink-secondary hover:text-ink border border-border rounded-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
              className="px-3.5 py-1.5 text-xs font-medium bg-danger text-surface-elevated rounded-sm hover:bg-danger/90 transition-colors flex items-center gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
