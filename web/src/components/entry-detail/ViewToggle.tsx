interface ViewToggleProps {
  view: "full" | "steps";
  onViewChange: (view: "full" | "steps") => void;
  stepCount?: number;
}

export default function ViewToggle({
  view,
  onViewChange,
  stepCount,
}: ViewToggleProps) {
  return (
    <div className="flex items-center border border-border rounded-sm text-xs overflow-hidden">
      <button
        onClick={() => onViewChange("full")}
        className={`px-3 py-1.5 transition-colors ${
          view === "full"
            ? "bg-ink text-surface"
            : "text-ink-secondary hover:text-ink"
        }`}
      >
        Full Page
      </button>
      <button
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
