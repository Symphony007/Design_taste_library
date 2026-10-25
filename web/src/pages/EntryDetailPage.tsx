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
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-secondary hover:text-danger hover:border-danger/30 border border-border rounded-sm transition-colors"
              title="Delete entry"
            >
              <Trash2 size={13} />
              <span>Delete entry</span>
            </button>
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
          <div className="space-y-6">
            {/* Header info */}
            <div className="space-y-2">
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
                    className="text-2xl font-semibold tracking-tight text-ink bg-surface-elevated border border-accent rounded px-2 py-0.5 outline-none w-full max-w-xl"
                  />
                </div>
              ) : (
                <h1
                  onClick={() => {
                    setTitleValue(entry.title);
                    setIsEditingTitle(true);
                  }}
                  title="Click to edit title"
                  className="text-2xl font-semibold tracking-tight text-ink hover:text-accent cursor-pointer transition-colors"
                >
                  {entry.title}
                </h1>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-ink-tertiary">
                {entry.source_url && (
                  <a
                    href={entry.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-ink-secondary hover:text-accent font-mono truncate max-w-lg no-underline"
                  >
                    <span>{entry.source_url}</span>
                    <ExternalLink size={12} className="shrink-0" />
                  </a>
                )}
                {createdDate && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Calendar size={12} />
                    <span>Captured on {createdDate}</span>
                  </span>
                )}
              </div>

              {/* Advisory Lines */}
              {entry.stop_reason && (
                <div className="text-xs text-amber-500 font-mono flex items-center gap-1.5 pt-1">
                  <AlertCircle size={13} />
                  <span>{entry.stop_reason}</span>
                </div>
              )}

              {entry.images && entry.images.length === 1 && (
                <div className="space-y-2 pt-2 pb-1">
                  <p className="text-xs text-ink-secondary">
                    This page may not have captured fully. If it has an intro screen, take your own screenshots and add them here:
                  </p>
                  <AddImagesZone onUpload={handleUploadMoreImages} isUploading={isUploadingImages} />
                </div>
              )}
            </div>

            {/* Layout: Section images on left, Notes editor on right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Vertical section screenshots */}
              <div className="lg:col-span-8 order-2 lg:order-1 space-y-6">
                <SectionList
                  images={entry.images || []}
                  title={entry.title}
                  onDeleteImage={handleDeleteImage}
                  isDeletingImageId={deletingImageId}
                />

                {/* Add more images control at bottom of section list */}
                {(!entry.images || entry.images.length !== 1) && (
                  <div className="pt-2">
                    <AddImagesZone onUpload={handleUploadMoreImages} isUploading={isUploadingImages} />
                  </div>
                )}
              </div>

              {/* Notes box */}
              <div className="lg:col-span-4 order-1 lg:order-2 lg:sticky lg:top-6">
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
