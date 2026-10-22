import { Link } from "react-router-dom";

import { Download } from "lucide-react";

interface HeaderProps {
  entryCount?: number;
  onExportClick?: () => void;
}

export default function Header({ entryCount, onExportClick }: HeaderProps) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <Link to="/" className="no-underline">
            <h1 className="text-lg font-semibold tracking-tight text-ink hover:text-accent transition-colors">
              Taste
            </h1>
          </Link>
          {entryCount !== undefined && (
            <span className="text-xs font-mono text-ink-tertiary tracking-wide">
              {entryCount} {entryCount === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>

        {onExportClick && (
          <button
            type="button"
            onClick={onExportClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border
              rounded-sm hover:border-border-strong text-ink-secondary hover:text-ink transition-colors"
          >
            <Download size={13} />
            <span>Export Skill</span>
          </button>
        )}
      </div>
    </header>
  );
}
