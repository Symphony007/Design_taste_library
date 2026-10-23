import { useState, useEffect } from "react";
import { Download, Loader2, FolderArchive, Terminal, Monitor, Sparkles, Copy, Check } from "lucide-react";
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
}

export default function ExportModal({
  open,
  onClose,
  totalCount,
  selectedCount = 0,
  selectedIds = [],
  initialScope = "all",
}: ExportModalProps) {
  const [scope, setScope] = useState<"all" | "selected">(initialScope);
  const [directionNotes, setDirectionNotes] = useState("");
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"desktop" | "code" | "antigravity">("desktop");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

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
      <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
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
                {totalCount} {totalCount === 1 ? "entry" : "entries"}
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
                {selectedCount} {selectedCount === 1 ? "entry" : "entries"}
              </span>
            </button>
          </div>
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

        {/* Installation Instructions per Agent */}
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="block text-xs font-mono uppercase text-ink-tertiary tracking-wider">
            Install Instructions per Agent
          </label>

          <div className="flex items-center gap-1 border-b border-border text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("desktop")}
              className={`px-3 py-1.5 border-b-2 font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "desktop"
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              <Monitor size={13} />
              <span>Claude App</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("code")}
              className={`px-3 py-1.5 border-b-2 font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "code"
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              <Terminal size={13} />
              <span>Claude Code</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("antigravity")}
              className={`px-3 py-1.5 border-b-2 font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "antigravity"
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              <Sparkles size={13} />
              <span>Antigravity / Gemini</span>
            </button>
          </div>

          <div className="p-3 bg-surface border border-border rounded-sm text-xs text-ink-secondary space-y-2">
            {activeTab === "desktop" && (
              <div className="space-y-1.5 text-[11px] leading-relaxed">
                <p className="font-medium text-ink">Install in Claude Desktop App:</p>
                <ol className="list-decimal list-inside space-y-1 text-ink-secondary">
                  <li>Ensure code execution is enabled in your Claude settings.</li>
                  <li>In the Claude Desktop sidebar, open <strong>Customize</strong> (or <strong>Skills</strong>).</li>
                  <li>Click <strong>Upload a skill</strong> and select the downloaded <code className="font-mono text-ink bg-surface-elevated px-1 py-0.5 border border-border rounded">taste-skill.zip</code>.</li>
                  <li>Toggle the skill <strong>On</strong> in your skill list. The ZIP root folder contains the required <code className="font-mono text-ink">designer-taste-library/SKILL.md</code>.</li>
                </ol>
              </div>
            )}

            {activeTab === "code" && (
              <div className="space-y-2 text-[11px] leading-relaxed">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">Install for Claude Code CLI:</span>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        "mkdir -p ~/.claude/skills && unzip taste-skill.zip -d ~/.claude/skills",
                        "code"
                      )
                    }
                    className="flex items-center gap-1 text-[10px] text-accent hover:underline font-mono"
                  >
                    {copiedKey === "code" ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedKey === "code" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="font-mono text-[11px] p-2 bg-surface-elevated border border-border rounded text-ink overflow-x-auto">
mkdir -p ~/.claude/skills
unzip taste-skill.zip -d ~/.claude/skills
                </pre>
                <p className="text-ink-tertiary">
                  Unpacks directly into <code className="font-mono text-ink">~/.claude/skills/designer-taste-library/</code>.
                </p>
              </div>
            )}

            {activeTab === "antigravity" && (
              <div className="space-y-2 text-[11px] leading-relaxed">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">Install for Google Antigravity / Gemini CLI:</span>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        "mkdir -p ~/.gemini/config/skills && unzip taste-skill.zip -d ~/.gemini/config/skills",
                        "antigravity"
                      )
                    }
                    className="flex items-center gap-1 text-[10px] text-accent hover:underline font-mono"
                  >
                    {copiedKey === "antigravity" ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedKey === "antigravity" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="font-mono text-[11px] p-2 bg-surface-elevated border border-border rounded text-ink overflow-x-auto">
# Global install
mkdir -p ~/.gemini/config/skills
unzip taste-skill.zip -d ~/.gemini/config/skills

# Or project-level
mkdir -p .agents/skills
unzip taste-skill.zip -d .agents/skills
                </pre>
              </div>
            )}
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
