import { Link } from "react-router-dom";

import { Download } from "lucide-react";

interface HeaderProps {
  onExportClick?: () => void;
}

export default function Header({ onExportClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-surface/85 backdrop-blur-xl transition-all">
      <div className="mx-auto max-w-7xl px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="no-underline flex items-center gap-2.5 group">
            {/* Official Logo */}
            <img
              src="/logo.png"
              alt="Specimen"
              className="w-7 h-7 object-contain group-hover:scale-105 transition-transform duration-200"
            />
            <span className="text-base font-semibold tracking-tight text-ink group-hover:text-ink/80 transition-colors">
              Specimen
            </span>
          </Link>
        </div>

        {onExportClick && (
          <button
            type="button"
            onClick={onExportClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border/90
              rounded-lg bg-surface-elevated hover:bg-surface-elevated hover:border-border-strong text-ink-secondary hover:text-ink shadow-2xs hover:shadow-xs transition-all active:scale-[0.98]"
          >
            <Download size={13} className="text-ink-tertiary group-hover:text-ink transition-colors" />
            <span>Export Skill</span>
          </button>
        )}
      </div>
    </header>
  );
}
