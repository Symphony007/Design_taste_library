interface ScreenshotViewerProps {
  view: "full" | "steps";
  fullPageUrl: string;
  title: string;
  stepImages?: string[];
}

export default function ScreenshotViewer({
  view,
  fullPageUrl,
  title,
  stepImages = [],
}: ScreenshotViewerProps) {
  if (view === "steps") {
    if (!stepImages || stepImages.length === 0) {
      return (
        <div className="py-20 text-center border border-dashed border-border rounded-sm bg-surface-elevated">
          <p className="text-sm text-ink-secondary">
            No stepped screenshots available for this entry.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto">
        {stepImages.map((stepUrl, index) => (
          <div
            key={stepUrl}
            className="flex flex-col gap-2 bg-surface-elevated border border-border rounded-sm overflow-hidden shadow-sm"
          >
            <div className="px-4 py-2 border-b border-border bg-surface flex items-center justify-between text-xs text-ink-tertiary">
              <span className="font-mono uppercase tracking-wider">
                Step {index + 1} of {stepImages.length}
              </span>
              <span className="font-mono">
                {stepUrl.split("/").pop()}
              </span>
            </div>
            <div className="overflow-hidden bg-surface">
              <img
                src={stepUrl}
                alt={`${title} - Step ${index + 1}`}
                loading="lazy"
                className="w-full h-auto block"
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Full page view
  return (
    <div className="w-full max-w-5xl mx-auto bg-surface-elevated border border-border rounded-sm overflow-hidden shadow-sm">
      <img
        src={fullPageUrl}
        alt={`${title} - Full page capture`}
        className="w-full h-auto block"
      />
    </div>
  );
}
