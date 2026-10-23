interface ViewToggleProps {
  view: "full" | "steps";
  onViewChange: (view: "full" | "steps") => void;
  stepCount?: number;
  fullPageDisabled?: boolean;
}

export default function ViewToggle({
  view,
  onViewChange,
  stepCount,
  fullPageDisabled = false,
}: ViewToggleProps) {
  return (
    <div className="flex items-center border border-border rounded-sm text-xs overflow-hidden">
      <button
        type="button"
        disabled={fullPageDisabled}
        onClick={() => !fullPageDisabled && onViewChange("full")}
        title={fullPageDisabled ? "Full page capture unavailable for scroll-locked pages" : undefined}
        className={`px-3 py-1.5 transition-colors ${
          fullPageDisabled
            ? "text-ink-tertiary/40 cursor-not-allowed bg-surface/50"
            : view === "full"
            ? "bg-ink text-surface"
            : "text-ink-secondary hover:text-ink"
        }`}
      >
        Full Page
      </button>
      <button
        type="button"
        onClick={() => onViewChange("steps")}
        className={`px-3 py-1.5 border-l border-border transition-colors ${
          view === "steps"
            ? "bg-ink text-surface"
            : "text-ink-secondary hover:text-ink"
        }`}
      >
        Steps{stepCount !== undefined && ` (${stepCount})`}
      </button>
    </div>
  );
}
