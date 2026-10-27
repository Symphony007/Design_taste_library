export default function EmptyState() {
  return (
    <div className="py-28 text-center max-w-md mx-auto space-y-3 animate-fade-in">
      <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border/80 shadow-xs flex items-center justify-center mx-auto text-ink-tertiary">
        <svg className="w-6 h-6 text-ink-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink">
        Your reference library is empty
      </p>
      <p className="text-xs text-ink-secondary leading-relaxed max-w-xs mx-auto">
        Paste a URL above to capture clean continuous rolling screenshots, or drop files to build your archive.
      </p>
    </div>
  );
}
