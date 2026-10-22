import { useState, useEffect, useRef } from "react";
import { Check, Loader2, Plus, X, Sparkles, AlertCircle } from "lucide-react";
import type { Entry, UpdateEntryInput } from "../../types/entry";
import {
  fetchAiStatus,
  fetchAiSuggestions,
  type AiSuggestionsResult,
} from "../../api/client";

export const STANDARD_CATEGORIES = [
  "portfolio",
  "SaaS/product landing",
  "e-commerce",
  "editorial/blog",
  "agency",
  "dashboard/product UI",
  "personal site",
  "experimental",
] as const;

interface EntryMetadataEditorProps {
  entry: Entry;
  onUpdate: (updates: UpdateEntryInput) => Promise<unknown> | void;
  isUpdating?: boolean;
}

export default function EntryMetadataEditor({
  entry,
  onUpdate,
  isUpdating = false,
}: EntryMetadataEditorProps) {
  const [category, setCategory] = useState(entry.category || "");
  const [tags, setTags] = useState<string[]>(entry.tags || []);
  const [notes, setNotes] = useState(entry.notes || "");
  const [newTag, setNewTag] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI tagger state
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionsResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Check if AI tagger is configured
  useEffect(() => {
    fetchAiStatus()
      .then((res) => setAiConfigured(res.configured))
      .catch(() => setAiConfigured(false));
  }, []);

  // Sync state if entry prop changes
  useEffect(() => {
    setCategory(entry.category || "");
    setTags(entry.tags || []);
    setNotes(entry.notes || "");
  }, [entry.id, entry.category, entry.tags, entry.notes]);

  function triggerStatus(status: "saved" | "error") {
    setSaveStatus(status);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (status === "saved") {
      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2500);
    }
  }

  async function handleSave(overrideUpdates?: Partial<UpdateEntryInput>) {
    const payload: UpdateEntryInput = {
      category: category.trim() || null,
      tags,
      notes: notes.trim() || null,
      ...overrideUpdates,
    };

    setSaveStatus("saving");
    try {
      await onUpdate(payload);
      triggerStatus("saved");
    } catch {
      triggerStatus("error");
    }
  }

  function handleAddTag(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const tag = newTag.trim().toLowerCase();
    if (!tag) return;
    if (tags.includes(tag)) {
      setNewTag("");
      return;
    }
    const updatedTags = [...tags, tag];
    setTags(updatedTags);
    setNewTag("");
    handleSave({ tags: updatedTags });
  }

  function handleRemoveTag(tagToRemove: string) {
    const updatedTags = tags.filter((t) => t !== tagToRemove);
    setTags(updatedTags);
    handleSave({ tags: updatedTags });
  }

  function handleCategoryBlur() {
    if (category.trim() !== (entry.category || "").trim()) {
      handleSave({ category: category.trim() || null });
    }
  }

  function handleNotesBlur() {
    if (notes.trim() !== (entry.notes || "").trim()) {
      handleSave({ notes: notes.trim() || null });
    }
  }

  async function handleRequestAiSuggestions() {
    setIsAiLoading(true);
    setAiError(null);
    setAiSuggestions(null);

    try {
      const result = await fetchAiSuggestions(entry.id);
      if (!result.configured) {
        setAiError(result.error || "Anthropic API key is not configured.");
      } else {
        setAiSuggestions(result);
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "Failed to generate suggestions.");
    } finally {
      setIsAiLoading(false);
    }
  }

  // Accept a suggested category
  function handleAcceptCategory(cat: string) {
    setCategory(cat);
    handleSave({ category: cat });
  }

  // Accept an individual suggested tag
  function handleAcceptTag(tag: string) {
    const clean = tag.toLowerCase().trim();
    if (!tags.includes(clean)) {
      const updatedTags = [...tags, clean];
      setTags(updatedTags);
      handleSave({ tags: updatedTags });
    }
  }

  // Accept all suggested tags at once
  function handleAcceptAllTags(suggestedTags: string[]) {
    const newTags = suggestedTags.map((t) => t.toLowerCase().trim()).filter((t) => !tags.includes(t));
    if (newTags.length > 0) {
      const updatedTags = [...tags, ...newTags];
      setTags(updatedTags);
      handleSave({ tags: updatedTags });
    }
  }

  // Append AI description to notes
  function handleAppendDescription(desc: string) {
    const updatedNotes = notes.trim() ? `${notes.trim()}\n\n${desc}` : desc;
    setNotes(updatedNotes);
    handleSave({ notes: updatedNotes });
  }

  const hasUnsavedText =
    category.trim() !== (entry.category || "").trim() ||
    notes.trim() !== (entry.notes || "").trim();

  return (
    <div className="bg-surface-elevated border border-border rounded-sm p-6 space-y-6">
      {/* Title & Status */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-semibold tracking-tight text-ink uppercase">
          Metadata & Notes
        </h2>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" || isUpdating ? (
            <span className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <Loader2 size={13} className="animate-spin text-accent" />
              Saving...
            </span>
          ) : saveStatus === "saved" ? (
            <span className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
              <Check size={13} />
              Saved
            </span>
          ) : saveStatus === "error" ? (
            <span className="text-xs text-danger font-medium">
              Save failed
            </span>
          ) : hasUnsavedText ? (
            <button
              onClick={() => handleSave()}
              className="text-xs font-medium text-accent hover:underline"
            >
              Save changes
            </button>
          ) : null}
        </div>
      </div>

      {/* AI Suggest Tags Section */}
      <div className="p-3 bg-surface border border-border rounded-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-accent" />
            <span className="text-xs font-semibold text-ink">AI Design Suggestions</span>
          </div>

          {aiConfigured === false ? (
            <span className="text-[11px] text-ink-tertiary">
              API key unconfigured
            </span>
          ) : (
            <button
              type="button"
              disabled={isAiLoading}
              onClick={handleRequestAiSuggestions}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-border
                rounded-sm hover:border-border-strong text-ink hover:text-accent bg-surface-elevated transition-colors
                disabled:opacity-50"
            >
              {isAiLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin text-accent" />
                  <span>Analyzing images...</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  <span>Suggest tags</span>
                </>
              )}
            </button>
          )}
        </div>

        {aiError && (
          <div className="flex items-center gap-1.5 text-[11px] text-danger">
            <AlertCircle size={13} className="shrink-0" />
            <span>{aiError}</span>
          </div>
        )}

        {/* Suggestions Panel */}
        {aiSuggestions && (
          <div className="space-y-3 pt-2 border-t border-border/60">
            {aiSuggestions.category && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono text-ink-tertiary block">
                  Suggested Category
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-ink bg-surface-elevated px-2 py-0.5 border border-border rounded-sm">
                    {aiSuggestions.category}
                  </span>
                  {category !== aiSuggestions.category && (
                    <button
                      type="button"
                      onClick={() => handleAcceptCategory(aiSuggestions!.category!)}
                      className="text-[11px] text-accent hover:underline font-medium"
                    >
                      Use category
                    </button>
                  )}
                </div>
              </div>
            )}

            {aiSuggestions.tags && aiSuggestions.tags.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono text-ink-tertiary block">
                    Suggested Tags
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAcceptAllTags(aiSuggestions!.tags!)}
                    className="text-[10px] text-accent hover:underline font-medium"
                  >
                    Add all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {aiSuggestions.tags.map((t) => {
                    const alreadyHas = tags.includes(t.toLowerCase());
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={alreadyHas}
                        onClick={() => handleAcceptTag(t)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded-sm border transition-colors ${
                          alreadyHas
                            ? "bg-surface-elevated border-border text-ink-tertiary opacity-60"
                            : "bg-surface-elevated border-border hover:border-accent text-ink"
                        }`}
                      >
                        <span>{t}</span>
                        {!alreadyHas && <Plus size={11} className="text-accent" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {aiSuggestions.description && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono text-ink-tertiary block">
                  Design Criticism
                </span>
                <p className="text-xs text-ink-secondary italic bg-surface-elevated p-2 border border-border rounded-sm leading-relaxed">
                  "{aiSuggestions.description}"
                </p>
                <button
                  type="button"
                  onClick={() => handleAppendDescription(aiSuggestions!.description!)}
                  className="text-[11px] text-accent hover:underline font-medium"
                >
                  Append to notes
                </button>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setAiSuggestions(null)}
                className="text-[11px] text-ink-tertiary hover:text-ink"
              >
                Dismiss suggestions
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <label
          htmlFor="entry-category"
          className="block text-xs font-mono uppercase text-ink-tertiary tracking-wider"
        >
          Category
        </label>
        <input
          id="entry-category"
          list="standard-categories"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={handleCategoryBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          placeholder="e.g. portfolio, SaaS/product landing, editorial/blog..."
          className="w-full px-3 py-2 bg-surface border border-border text-sm text-ink
            placeholder:text-ink-tertiary focus:outline-none focus:border-border-strong rounded-sm"
        />
        <datalist id="standard-categories">
          {STANDARD_CATEGORIES.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>

        {/* Quick category chips */}
        <div className="flex flex-wrap gap-1 pt-1">
          {STANDARD_CATEGORIES.slice(0, 4).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleAcceptCategory(cat)}
              className={`text-[10px] font-mono px-2 py-0.5 rounded-sm border transition-colors ${
                category === cat
                  ? "border-accent text-accent bg-accent-light"
                  : "border-border text-ink-tertiary hover:text-ink"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label className="block text-xs font-mono uppercase text-ink-tertiary tracking-wider">
          Tags
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border
                text-xs font-mono text-ink rounded-sm"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-ink-tertiary hover:text-danger p-0.5 rounded-sm"
                aria-label={`Remove tag ${tag}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}

          <form onSubmit={handleAddTag} className="inline-flex items-center">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag..."
              className="px-2.5 py-1 bg-surface border border-dashed border-border text-xs font-mono
                text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-border-strong
                rounded-sm w-28"
            />
            {newTag.trim() && (
              <button
                type="submit"
                className="ml-1.5 p-1 bg-surface border border-border hover:bg-surface-elevated text-ink rounded-sm"
                aria-label="Add tag"
              >
                <Plus size={12} />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label
          htmlFor="entry-notes"
          className="block text-xs font-mono uppercase text-ink-tertiary tracking-wider"
        >
          Notes
        </label>
        <textarea
          id="entry-notes"
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Design observations, typography notes, color palette thoughts, interaction details..."
          className="w-full px-3 py-2 bg-surface border border-border text-sm text-ink
            placeholder:text-ink-tertiary focus:outline-none focus:border-border-strong rounded-sm resize-y"
        />
        <div className="flex justify-between items-center text-[11px] text-ink-tertiary">
          <span>Saves automatically when you click outside</span>
          {hasUnsavedText && (
            <button
              onClick={() => handleSave()}
              className="text-accent hover:underline font-medium text-xs"
            >
              Save now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
