interface ScreenshotViewerProps {
  fullPageUrl: string;
  title: string;
}

export default function ScreenshotViewer({
  fullPageUrl,
  title,
}: ScreenshotViewerProps) {
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
