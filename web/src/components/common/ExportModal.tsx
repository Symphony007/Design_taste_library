import { useState, useEffect } from "react";
import { Download, Loader2, Info, FolderArchive } from "lucide-react";
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
  filteredCount?: number;
  selectedCount?: number;
  selectedIds?: string[];
  activeCategory?: string | null;
  activeTag?: string | null;
  initialScope?: "all" | "filtered" | "selected";
}

export default function ExportModal({
  open,
  onClose,
  totalCount,
  filteredCount = 0,
  selectedCount = 0,
  selectedIds = [],
  activeCategory,
  activeTag,
  initialScope = "all",
}: ExportModalProps) {
  const [scope, setScope] = useState<"all" | "filtered" | "selected">(initialScope);
  const [directionNotes, setDirectionNotes] = useState("");
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize scope when modal opens
  useEffect(() => {
    if (open) {
      if (selectedCount > 0) {
        setScope("selected");
      } else if (activeCategory || activeTag) {
        setScope("filtered");
      } else {
        setScope("all");
      }
      setError(null);

      // Fetch direction notes
      setIsLoadingNotes(true);
      fetchDirectionNotes()
        .then((notes) => setDirectionNotes(notes))
        .catch(() => {})
        .finally(() => setIsLoadingNotes(false));
    }
  }, [open, selectedCount, activeCategory, activeTag]);

  async function handleExport() {
    setIsExporting(true);
    setError(null);

    try {
      // Save direction notes if changed
      if (directionNotes.trim()) {
        await saveDirectionNotes(directionNotes.trim()).catch(() => {});
      }

      const options: ExportOptions = {
        scope,
        category: scope === "filtered" ? activeCategory || undefined : undefined,
        tag: scope === "filtered" ? activeTag || undefined : undefined,
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

  const exportCount =
    scope === "selected"
      ? selectedCount
      : scope === "filtered"
      ? filteredCount
      : totalCount;

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
            Export Scope
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                {totalCount} {totalCount === 1 ? "entry" : "entries"}
              </span>
            </button>

            <button
              type="button"
              disabled={!activeCategory && !activeTag}
              onClick={() => setScope("filtered")}
              className={`p-2.5 border text-left rounded-sm text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                scope === "filtered"
                  ? "border-accent bg-accent-light text-ink"
                  : "border-border hover:border-border-strong text-ink-secondary"
              }`}
            >
              <span className="font-semibold block">Filtered</span>
              <span className="text-[11px] text-ink-tertiary block mt-0.5 truncate">
                {filteredCount} entries
                {activeCategory ? ` (${activeCategory})` : ""}
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
              <span className="font-semibold block">Selected</span>
              <span className="text-[11px] text-ink-tertiary block mt-0.5">
                {selectedCount} selected
              </span>
            </button>
          </div>
        </div>

        {/* Direction Notes */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="export-direction-notes"
              className="block text-xs font-mono uppercase text-ink-tertiary tracking-wider"
            >
              Designer Direction Notes
            </label>
            <span className="text-[11px] text-ink-tertiary">
              Included in SKILL.md for the agent
            </span>
          </div>
          {isLoadingNotes ? (
            <div className="py-6 text-center text-xs text-ink-tertiary">
              <Loader2 size={14} className="animate-spin inline mr-1 text-accent" />
              Loading direction notes...
            </div>
          ) : (
            <textarea
              id="export-direction-notes"
              rows={3}
              value={directionNotes}
              onChange={(e) => setDirectionNotes(e.target.value)}
              placeholder="e.g. warm, editorial aesthetic, restrained color, strong type hierarchy..."
              className="w-full px-3 py-2 bg-surface border border-border text-xs text-ink
                placeholder:text-ink-tertiary focus:outline-none focus:border-border-strong rounded-sm resize-y font-sans"
            />
          )}
        </div>

        {/* How to use this hint */}
        <div className="p-3 bg-surface border border-border rounded-sm flex items-start gap-2.5 text-xs text-ink-secondary">
          <Info size={15} className="text-accent shrink-0 mt-0.5" />
          <div className="space-y-1 text-[11px] leading-relaxed">
            <span className="font-medium text-ink block">How to use this skill:</span>
            <p>
              Unzip the downloaded folder into your AI coding agent's skills directory (e.g.{" "}
              <code className="font-mono text-ink bg-surface-elevated px-1 py-0.5 border border-border rounded">
                .agents/skills/designer-taste-library
              </code>{" "}
              or{" "}
              <code className="font-mono text-ink bg-surface-elevated px-1 py-0.5 border border-border rounded">
                ~/.gemini/config/skills/
              </code>
              ). Your agent will study these references before generating new UI.
            </p>
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
