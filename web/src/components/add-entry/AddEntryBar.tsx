import { useState, useRef, useEffect } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { captureEntry, ApiError } from "../../api/client";

export default function AddEntryBar() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ url, force }: { url: string; force?: boolean }) =>
      captureEntry(url, { force }),
    onSuccess: () => {
      setUrl("");
      setError(null);
      setIsDuplicate(false);
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        setError("This URL has already been captured.");
        setIsDuplicate(true);
      } else if (err instanceof ApiError && err.status === 429) {
        setError("A capture is already running. Please wait.");
      } else {
        setError(err.message);
        setIsDuplicate(false);
      }
    },
  });

  // Elapsed timer while capturing
  useEffect(() => {
    if (mutation.isPending) {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mutation.isPending]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || mutation.isPending) return;
    setError(null);
    setIsDuplicate(false);
    mutation.mutate({ url: url.trim() });
  }

  function handleRecapture() {
    if (!url.trim()) return;
    setError(null);
    setIsDuplicate(false);
    mutation.mutate({ url: url.trim(), force: true });
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex gap-3 items-center">
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Paste a URL to capture..."
          disabled={mutation.isPending}
          className="flex-1 px-4 py-2.5 bg-surface-elevated border border-border text-sm text-ink
            placeholder:text-ink-tertiary focus:outline-none focus:border-border-strong
            rounded-sm font-sans disabled:opacity-50 transition-colors"
        />
        <button
          type="submit"
          disabled={mutation.isPending || !url.trim()}
          className="px-4 py-2.5 bg-ink text-surface text-sm font-medium
            rounded-sm hover:bg-ink/90 disabled:opacity-30 transition-colors
            flex items-center gap-2 shrink-0"
        >
          {mutation.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span className="font-mono text-xs">{elapsed}s</span>
            </>
          ) : (
            <>
              Capture
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-sm">
          <p className="text-danger">{error}</p>
          {isDuplicate && (
            <button
              onClick={handleRecapture}
              className="text-accent hover:underline shrink-0 text-sm"
            >
              Re-capture
            </button>
          )}
        </div>
      )}
    </div>
  );
}
