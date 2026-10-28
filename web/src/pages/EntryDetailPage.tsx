import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Trash2, Loader2, Calendar, AlertCircle } from "lucide-react";
import Header from "../components/common/Header";
import Modal from "../components/common/Modal";
import SectionList from "../components/entry-detail/ScreenshotViewer";
import NotesEditor from "../components/entry-detail/NotesEditor";
import AddImagesZone from "../components/entry-detail/AddImagesZone";
import { useEntry } from "../hooks/useEntry";
import { uploadImagesToEntry } from "../api/client";
import { useQueryClient } from "@tanstack/react-query";

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  const {
    entry,
    isLoading,
    isError,
    error,
    updateEntryAsync,
    isUpdating,
    deleteEntry,
    isDeleting,
    deleteImage,
  } = useEntry(id);

  async function handleDeleteConfirm() {
    try {
      await deleteEntry();
      setDeleteModalOpen(false);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleDeleteImage(imageId: string) {
    if (!window.confirm("Are you sure you want to delete this section screenshot?")) {
      return;
    }
    setDeletingImageId(imageId);
    try {
      await deleteImage(imageId);
    } catch (err: unknown) {
      alert(`Failed to delete image: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDeletingImageId(null);
    }
  }

  async function handleUploadMoreImages(files: File[]) {
    if (!id || files.length === 0) return;
    setIsUploadingImages(true);
    try {
      const updated = await uploadImagesToEntry(id, files);
      queryClient.setQueryData(["entry", id], updated);
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    } catch (err: unknown) {
      alert(`Upload failed: ${err instanceof Error ? err.message : "Failed to upload screenshots."}`);
    } finally {
      setIsUploadingImages(false);
    }
  }

  async function handleTitleSave() {
    if (!titleValue.trim() || titleValue.trim() === entry?.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await updateEntryAsync({ title: titleValue.trim() });
    } finally {
      setIsEditingTitle(false);
    }
  }

  const createdDate = entry?.created_at
    ? new Date(entry.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  const [showAddImages, setShowAddImages] = useState(false);

  return (
    <div className="min-h-screen flex flex-col text-ink relative z-10">
      <Header />

      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-6 space-y-6">
        {/* Navigation & Actions Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border/60">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-ink-secondary hover:text-ink transition-colors no-underline px-2.5 py-1.5 rounded-lg hover:bg-surface-elevated"
          >
            <ArrowLeft size={14} />
            <span>Library</span>
            <span className="text-ink-tertiary">/</span>
            <span className="text-ink truncate max-w-[200px]">{entry?.title || "Reference"}</span>
          </Link>

          {entry && (
            <div className="flex items-center gap-2">
              {entry.source_url && (
                <a
                  href={entry.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border/80 rounded-lg bg-surface-elevated hover:bg-surface hover:border-border-strong text-ink shadow-2xs transition-all"
                  title="Open live website in new tab"
                >
                  <ExternalLink size={12} className="text-ink-tertiary" />
                  <span>Open live site</span>
                </a>
              )}

              {entry.images && entry.images.length > 0 && (
                <a
                  href={entry.images[0].url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border/80 rounded-lg bg-surface-elevated hover:bg-surface hover:border-border-strong text-ink shadow-2xs transition-all"
                  title="Open full resolution image"
                >
                  <span>Full image</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-tertiary hover:text-danger hover:border-danger/30 hover:bg-danger-light/50 border border-border/80 rounded-lg bg-surface-elevated shadow-2xs transition-all"
                title="Delete entry"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-3 text-ink-tertiary">
            <Loader2 size={24} className="animate-spin text-ink" />
            <p className="text-xs font-mono">Loading reference details...</p>
          </div>
        ) : isError || !entry ? (
          <div className="py-32 text-center space-y-4">
            <p className="text-base text-ink font-semibold">Reference not found</p>
            <p className="text-xs text-ink-secondary">
              {error?.message || "The requested entry does not exist or may have been deleted."}
            </p>
            <Link
              to="/"
              className="inline-block px-4 py-2 border border-border rounded-lg text-xs font-medium text-ink hover:border-border-strong bg-surface-elevated shadow-xs no-underline"
            >
              Return to library
            </Link>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* Header info */}
            <div className="space-y-3">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    autoFocus
                    className="text-2xl sm:text-3xl font-bold tracking-tight text-ink bg-surface-elevated border border-ink/40 rounded-xl px-3 py-1 outline-none w-full max-w-xl shadow-xs"
                  />
                </div>
              ) : (
                <h1
                  onClick={() => {
                    setTitleValue(entry.title);
                    setIsEditingTitle(true);
                  }}
                  title="Click to edit title"
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-ink hover:text-ink/75 cursor-pointer transition-colors flex items-center gap-2.5 group"
                >
                  <span>{entry.title}</span>
                  <span className="text-xs font-mono text-ink-tertiary opacity-0 group-hover:opacity-100 transition-opacity font-normal">
                    (click to edit)
                  </span>
                </h1>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-tertiary">
                {entry.source_url && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-elevated border border-border/80 font-mono text-ink-secondary shadow-2xs">
                    <span>{new URL(entry.source_url).hostname.replace(/^www\./, "")}</span>
                  </div>
                )}
                {createdDate && (
                  <span className="inline-flex items-center gap-1.5 font-mono px-2 py-1 text-ink-tertiary">
                    <Calendar size={12} />
                    <span>Captured on {createdDate}</span>
                  </span>
                )}
                {entry.images && entry.images.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 font-mono px-2.5 py-1 rounded-lg bg-surface-sunken text-ink-secondary text-[11px]">
                    <span>{entry.images.length} {entry.images.length === 1 ? "screen" : "screens"}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddImages((v) => !v)}
                  className="text-xs font-medium text-ink-secondary hover:text-ink underline ml-auto cursor-pointer"
                >
                  {showAddImages ? "Hide screenshot upload" : "+ Add screenshots"}
                </button>
              </div>

              {/* Stop reason banner if applicable */}
              {entry.stop_reason && (
                <div className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl font-mono flex items-center gap-2">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <span>{entry.stop_reason}</span>
                </div>
              )}

              {/* Collapsible append screenshots zone */}
              {showAddImages && (
                <div className="p-4 bg-surface-elevated border border-border/80 rounded-2xl shadow-xs space-y-2 animate-fade-in">
                  <p className="text-xs text-ink-secondary font-medium">
                    Upload or append extra screenshots to this reference:
                  </p>
                  <AddImagesZone onUpload={handleUploadMoreImages} isUploading={isUploadingImages} />
                </div>
              )}
            </div>

            {/* Layout: Section images on left, Notes editor on right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Vertical section screenshots canvas */}
              <div className="lg:col-span-8 order-2 lg:order-1 space-y-6">
                <SectionList
                  images={entry.images || []}
                  title={entry.title}
                  onDeleteImage={handleDeleteImage}
                  isDeletingImageId={deletingImageId}
                />
              </div>

              {/* Notes sidebar */}
              <div className="lg:col-span-4 order-1 lg:order-2 lg:sticky lg:top-20">
                <NotesEditor
                  initialNotes={entry.notes}
                  onSave={async (newNotes) => {
                    await updateEntryAsync({ notes: newNotes });
                  }}
                  isSaving={isUpdating}
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
            This will permanently remove <span className="font-medium text-ink font-mono">{entry?.title}</span> along with all its section screenshots. This action cannot be undone.
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
