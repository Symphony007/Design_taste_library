import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";

interface NotesEditorProps {
  initialNotes: string | null;
  onSave: (notes: string | null) => Promise<void>;
  isSaving?: boolean;
}

export default function NotesEditor({
  initialNotes,
  onSave,
  isSaving = false,
}: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Keep in sync with initialNotes when entry changes
  useEffect(() => {
    setNotes(initialNotes || "");
  }, [initialNotes]);

  async function handleBlur() {
    const currentVal = notes.trim();
    const prevVal = (initialNotes || "").trim();

    if (currentVal === prevVal) {
      return;
    }

    setSaveStatus("saving");
    try {
      await onSave(currentVal || null);
      setSaveStatus("saved");
      setTimeout(() => {
        setSaveStatus("idle");
      }, 2500);
    } catch {
      setSaveStatus("idle");
    }
  }

  return (
    <div className="border border-border/80 rounded-2xl bg-surface-elevated p-4 space-y-3 shadow-sm hover:border-border-strong transition-all">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-secondary flex items-center gap-1.5">
          <span>Notes & Critique</span>
        </h2>
        <div className="text-[11px] font-mono h-4 flex items-center">
          {isSaving || saveStatus === "saving" ? (
            <span className="flex items-center gap-1 text-ink-tertiary">
              <Loader2 size={11} className="animate-spin text-ink" />
              <span>Saving...</span>
            </span>
          ) : saveStatus === "saved" ? (
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <Check size={12} strokeWidth={2.5} />
              <span>Saved</span>
            </span>
          ) : null}
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
        rows={10}
        placeholder="Record design observations, typography choices, visual interactions, or palette notes..."
        className="w-full px-3.5 py-3 text-xs text-ink bg-surface-sunken/40 border border-border/70 rounded-xl
          placeholder:text-ink-tertiary focus:outline-none focus:border-ink/30 focus:bg-surface-elevated focus:ring-2 focus:ring-ink/5 resize-y font-sans leading-relaxed transition-all"
      />
    </div>
  );
}
