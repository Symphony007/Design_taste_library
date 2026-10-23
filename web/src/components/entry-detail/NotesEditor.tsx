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
    <div className="border border-border rounded-sm bg-surface-elevated p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
          Notes
        </h2>
        <div className="text-[11px] font-mono h-4 flex items-center">
          {isSaving || saveStatus === "saving" ? (
            <span className="flex items-center gap-1 text-ink-tertiary">
              <Loader2 size={11} className="animate-spin text-accent" />
              <span>Saving...</span>
            </span>
          ) : saveStatus === "saved" ? (
            <span className="flex items-center gap-1 text-accent font-medium">
              <Check size={12} />
              <span>Saved</span>
            </span>
          ) : null}
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
        rows={8}
        placeholder="Add notes, observations, or thoughts on this design..."
        className="w-full px-3 py-2.5 text-xs text-ink bg-surface border border-border rounded-sm
          placeholder:text-ink-tertiary focus:outline-none focus:border-border-strong resize-y font-sans leading-relaxed"
      />
    </div>
  );
}
