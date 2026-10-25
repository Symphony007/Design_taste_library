import { useState, useEffect } from "react";
import { Download, Loader2, FolderArchive, Info } from "lucide-react";
import Modal from "./Modal";
import {
  fetchDirectionNotes,
  saveDirectionNotes,
  downloadExport,
  type ExportOptions,
} from "../../api/client";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  totalCount: number;
  selectedCount?: number;
  selectedIds?: string[];
  initialScope?: "all" | "selected";
  totalImagesCount?: number;
  selectedImagesCount?: number;
}

export default function ExportModal({
  open,
  onClose,
  totalCount,
  selectedCount = 0,
  selectedIds = [],
  initialScope = "all",
  totalImagesCount = 0,
  selectedImagesCount = 0,
}: ExportModalProps) {
  const [scope, setScope] = useState<"all" | "selected">(initialScope);
  const [directionNotes, setDirectionNotes] = useState("");
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setScope(selectedCount > 0 ? "selected" : "all");
      setError(null);

      setIsLoadingNotes(true);
      fetchDirectionNotes()
        .then((notes) => setDirectionNotes(notes || ""))
        .catch(() => {})
        .finally(() => setIsLoadingNotes(false));
    }
  }, [open, selectedCount]);

  async function handleExport() {
    setIsExporting(true);
    setError(null);

    try {
      if (directionNotes.trim()) {
        await saveDirectionNotes(directionNotes.trim()).catch(() => {});
      }

      const options: ExportOptions = {
        scope,
        entryIds: scope === "selected" ? selectedIds : undefined,
        directionNotes: directionNotes.trim(),
      };

      await downloadExport(options);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to export reference library.");
    } finally {
      setIsExporting(false);
    }
  }

  const exportCount = scope === "selected" ? selectedCount : totalCount;

  return (
    <Modal open={open} onClose={isExporting ? () => {} : onClose}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <FolderArchive size={18} className="text-accent" />
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Export as Claude Agent Skill
          </h2>
        </div>

        {/* Scope Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-mono uppercase text-ink-tertiary tracking-wider">
            Export Scope & Image Count
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`p-2.5 border text-left rounded-sm text-xs transition-colors ${
                scope === "all"
                  ? "border-accent bg-accent-light text-ink"
                  : "border-border hover:border-border-strong text-ink-secondary"
              }`}
            >
              <span className="font-semibold block">All References</span>
              <span className="text-[11px] text-ink-tertiary block mt-0.5">
                {totalCount} {totalCount === 1 ? "entry" : "entries"} · {totalImagesCount} {totalImagesCount === 1 ? "image" : "images"}
              </span>
            </button>

            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setScope("selected")}
              className={`p-2.5 border text-left rounded-sm text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                scope === "selected"
                  ? "border-accent bg-accent-light text-ink"
                  : "border-border hover:border-border-strong text-ink-secondary"
              }`}
            >
              <span className="font-semibold block">Selected Only</span>
              <span className="text-[11px] text-ink-tertiary block mt-0.5">
                {selectedCount} {selectedCount === 1 ? "entry" : "entries"} · {selectedImagesCount} {selectedImagesCount === 1 ? "image" : "images"}
              </span>
            </button>
          </div>
          <p className="text-[11px] text-ink-tertiary">
            Total images to convert & export: <strong className="text-ink font-medium">{scope === "selected" ? selectedImagesCount : totalImagesCount}</strong>
          </p>
        </div>

        {/* Direction Notes */}
        <div className="space-y-1.5">
          <label
            htmlFor="export-direction-notes"
            className="block text-xs font-mono uppercase text-ink-tertiary tracking-wider"
          >
            Designer Direction Notes (Optional)
          </label>
          <p className="text-[11px] text-ink-secondary leading-relaxed">
            High-level aesthetic direction injected into SKILL.md. Leave empty to omit this section.
          </p>
          {isLoadingNotes ? (
            <div className="h-20 flex items-center justify-center border border-border rounded-sm bg-surface">
              <Loader2 size={16} className="animate-spin text-accent" />
            </div>
          ) : (
            <textarea
              id="export-direction-notes"
              rows={3}
              value={directionNotes}
              onChange={(e) => setDirectionNotes(e.target.value)}
              placeholder="e.g. warm editorial aesthetic, restrained color palette, strong typographic hierarchy..."
              className="w-full px-3 py-2 bg-surface border border-border text-xs text-ink
                placeholder:text-ink-tertiary focus:outline-none focus:border-border-strong rounded-sm resize-y font-sans"
            />
          )}
        </div>

        {/* Install instructions */}
        <div className="p-3 bg-surface border border-border rounded-sm space-y-2 text-xs text-ink-secondary">
          <div className="flex items-center gap-2 text-ink font-medium">
            <Info size={14} className="text-accent shrink-0" />
            <span>How to install this skill:</span>
          </div>
          <div className="space-y-1.5 text-[11px] leading-relaxed pl-5">
            <div>
              <strong className="text-ink">Claude Code:</strong> Unzip into <code className="font-mono bg-surface-elevated px-1 py-0.5 border border-border rounded text-ink">~/.claude/skills/</code>. Resulting layout:
              <pre className="mt-1 p-2 bg-surface-elevated border border-border rounded font-mono text-[10px] text-ink leading-tight">
{`~/.claude/skills/designer-taste-library/
  SKILL.md
  references/
  assets/`}
              </pre>
            </div>
            <div className="pt-1">
              <strong className="text-ink">Claude app:</strong> Add the ZIP in the app's skills settings.
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-xs text-danger font-medium">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="px-3.5 py-2 text-xs text-ink-secondary hover:text-ink border border-border rounded-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isExporting || exportCount === 0}
            onClick={handleExport}
            className="px-4 py-2 text-xs font-medium bg-ink text-surface rounded-sm hover:bg-ink/90
              disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 size={13} className="animate-spin text-accent" />
                <span>Preparing ZIP & images...</span>
              </>
            ) : (
              <>
                <Download size={13} />
                <span>Download Skill ({exportCount} {exportCount === 1 ? "entry" : "entries"})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
