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
        <div className="flex items-center gap-2.5 border-b border-border/70 pb-4">
          <div className="w-8 h-8 rounded-xl bg-accent-light border border-border/60 flex items-center justify-center text-accent">
            <FolderArchive size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-ink">
              Export as Claude Agent Skill
            </h2>
            <p className="text-[11px] text-ink-tertiary">
              Package selected visual references into a runnable agent design skill
            </p>
          </div>
        </div>

        {/* Scope Selection */}
        <div className="space-y-2">
          <label className="block text-[10px] font-mono uppercase text-ink-tertiary tracking-wider font-semibold">
            Export Scope & Image Count
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`p-3 border text-left rounded-xl text-xs transition-all ${
                scope === "all"
                  ? "border-ink bg-ink text-surface shadow-xs"
                  : "border-border/80 hover:border-border-strong text-ink-secondary bg-surface-elevated"
              }`}
            >
              <span className="font-semibold block">All References</span>
              <span className={`text-[11px] block mt-0.5 ${scope === "all" ? "text-surface/75" : "text-ink-tertiary"}`}>
                {totalCount} {totalCount === 1 ? "entry" : "entries"} · {totalImagesCount} {totalImagesCount === 1 ? "image" : "images"}
              </span>
            </button>

            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setScope("selected")}
              className={`p-3 border text-left rounded-xl text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                scope === "selected"
                  ? "border-ink bg-ink text-surface shadow-xs"
                  : "border-border/80 hover:border-border-strong text-ink-secondary bg-surface-elevated"
              }`}
            >
              <span className="font-semibold block">Selected Only</span>
              <span className={`text-[11px] block mt-0.5 ${scope === "selected" ? "text-surface/75" : "text-ink-tertiary"}`}>
                {selectedCount} {selectedCount === 1 ? "entry" : "entries"} · {selectedImagesCount} {selectedImagesCount === 1 ? "image" : "images"}
              </span>
            </button>
          </div>
          <p className="text-[11px] text-ink-tertiary flex items-center gap-1.5 pt-0.5">
            Total visual layers to package: <strong className="text-ink font-semibold">{scope === "selected" ? selectedImagesCount : totalImagesCount}</strong>
          </p>
        </div>

        {/* Direction Notes */}
        <div className="space-y-1.5">
          <label
            htmlFor="export-direction-notes"
            className="block text-[10px] font-mono uppercase text-ink-tertiary tracking-wider font-semibold"
          >
            Designer Direction Notes (Optional)
          </label>
          <p className="text-[11px] text-ink-secondary leading-relaxed">
            High-level aesthetic direction injected into SKILL.md. Leave empty to omit this section.
          </p>
          {isLoadingNotes ? (
            <div className="h-20 flex items-center justify-center border border-border/80 rounded-xl bg-surface-sunken/40">
              <Loader2 size={16} className="animate-spin text-accent" />
            </div>
          ) : (
            <textarea
              id="export-direction-notes"
              rows={3}
              value={directionNotes}
              onChange={(e) => setDirectionNotes(e.target.value)}
              placeholder="e.g. warm editorial aesthetic, restrained color palette, strong typographic hierarchy..."
              className="w-full px-3.5 py-2.5 bg-surface-sunken/40 border border-border/70 text-xs text-ink
                placeholder:text-ink-tertiary focus:outline-none focus:border-ink/30 focus:bg-surface-elevated rounded-xl resize-y font-sans transition-all"
            />
          )}
        </div>

        {/* Install instructions */}
        <div className="p-3.5 bg-surface-sunken/40 border border-border/70 rounded-xl space-y-2 text-xs text-ink-secondary">
          <div className="flex items-center gap-2 text-ink font-medium">
            <Info size={14} className="text-accent shrink-0" />
            <span className="font-semibold text-xs">Skill installation:</span>
          </div>
          <div className="space-y-1.5 text-[11px] leading-relaxed pl-5">
            <div>
              <strong className="text-ink font-medium">Claude Code CLI:</strong> Unzip into <code className="font-mono bg-surface-elevated px-1.5 py-0.5 border border-border/70 rounded-md text-ink text-[10px]">~/.claude/skills/</code>
            </div>
            <div>
              <strong className="text-ink font-medium">Claude Desktop:</strong> Upload ZIP in app settings under Skills.
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
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/70">
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-ink-secondary hover:text-ink border border-border/80 bg-surface-elevated hover:bg-surface rounded-xl shadow-2xs transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isExporting || exportCount === 0}
            onClick={handleExport}
            className="px-4 py-2 text-xs font-medium bg-ink text-surface rounded-xl hover:bg-ink/90
              disabled:opacity-40 shadow-xs hover:shadow-sm transition-all flex items-center gap-2"
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
