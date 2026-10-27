import { useState, useRef, useEffect } from "react";
import { ArrowRight, Loader2, Upload, Image as ImageIcon, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { captureEntry, createEntryWithImages, ApiError } from "../../api/client";

export default function AddEntryBar() {
  const [url, setUrl] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      // Validation: require at least a URL or one image
      if (!url.trim() && selectedFiles.length === 0) {
        throw new Error("Please provide either a URL to capture or at least one screenshot.");
      }

      if (selectedFiles.length > 0) {
        const formData = new FormData();
        if (url.trim()) {
          formData.append("url", url.trim());
        }
        for (const file of selectedFiles) {
          formData.append("images", file);
        }
        return createEntryWithImages(formData);
      } else {
        return captureEntry(url.trim());
      }
    },
    onSuccess: () => {
      setUrl("");
      setSelectedFiles([]);
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
        setError(err.message || "Failed to create entry.");
        setIsDuplicate(false);
      }
    },
  });

  // Recapture mutation for 409 duplicates
  const recaptureMutation = useMutation({
    mutationFn: (urlToRecapture: string) => captureEntry(urlToRecapture, { force: true }),
    onSuccess: () => {
      setUrl("");
      setSelectedFiles([]);
      setError(null);
      setIsDuplicate(false);
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (err: Error) => {
      setError(err.message || "Recapture failed.");
    },
  });

  const isPending = mutation.isPending || recaptureMutation.isPending;

  // Elapsed timer while capturing
  useEffect(() => {
    if (isPending) {
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
  }, [isPending]);

  // Global paste handler to capture pasted screenshots anywhere on page
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (isPending) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        setError(null);
        setSelectedFiles((prev) => [...prev, ...pastedFiles]);
      }
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [isPending]);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (isPending) return;

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(f.name)
    );

    if (files.length > 0) {
      setError(null);
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setError(null);
      setSelectedFiles((prev) => [...prev, ...files]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    setIsDuplicate(false);
    mutation.mutate();
  }

  return (
    <div className="w-full space-y-3">
      {/* Studio Command Dock */}
      <div className="bg-surface-elevated border border-border/80 rounded-2xl shadow-sm p-1.5 sm:p-2 transition-all hover:border-border-strong focus-within:border-ink/40 focus-within:ring-2 focus-within:ring-ink/5">
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <div className="relative flex-1 flex items-center">
            <span className="absolute left-3.5 text-ink-tertiary pointer-events-none flex items-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </span>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Paste design URL (e.g. stripe.com or notion.com)..."
              disabled={isPending}
              className="w-full pl-10 pr-4 py-2.5 bg-transparent text-sm text-ink placeholder:text-ink-tertiary outline-none font-sans disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            className="px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink bg-surface-sunken hover:bg-border/60 rounded-xl transition-all flex items-center gap-1.5 shrink-0 active:scale-95"
            title="Upload or pick screenshots"
          >
            <Upload size={13} className="text-ink-tertiary" />
            <span className="hidden sm:inline">Upload</span>
          </button>

          <button
            type="submit"
            disabled={isPending || (!url.trim() && selectedFiles.length === 0)}
            className="px-4 py-2 bg-ink text-surface text-xs font-semibold
              rounded-xl hover:bg-ink/90 active:scale-[0.98] disabled:opacity-30 transition-all
              flex items-center gap-2 shrink-0 shadow-xs"
          >
            {isPending ? (
              <>
                <Loader2 size={13} className="animate-spin text-surface" />
                <span className="font-mono text-[11px]">{elapsed}s</span>
              </>
            ) : (
              <>
                <span>{selectedFiles.length > 0 ? "Save Entry" : "Capture"}</span>
                <ArrowRight size={13} />
              </>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
        </form>
      </div>

      {/* Drag & drop / paste dropzone & file chips */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        className={`border border-dashed rounded-xl px-4 py-2.5 transition-all text-center text-xs ${
          isDragging
            ? "border-accent-blue bg-blue-50/50 text-ink scale-[1.01]"
            : "border-border/70 hover:border-border-strong bg-surface-elevated/40 text-ink-tertiary"
        }`}
      >
        {selectedFiles.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-0.5">
            <ImageIcon size={13} className="text-ink-tertiary" />
            <span className="text-[11px]">
              Or drop local screenshots here • Paste anywhere with{" "}
              <kbd className="font-mono text-[10px] bg-surface-elevated border border-border/80 px-1.5 py-0.5 rounded-md shadow-2xs text-ink-secondary">
                Ctrl+V
              </kbd>
            </span>
          </div>
        ) : (
          <div className="space-y-2 py-0.5">
            <div className="flex items-center justify-between text-xs text-ink-secondary pb-1 border-b border-border/60">
              <span className="font-medium text-ink">{selectedFiles.length} screenshot(s) selected</span>
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                className="text-danger hover:underline text-[11px] font-medium"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5 max-h-28 overflow-y-auto">
              {selectedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-elevated border border-border/80 rounded-lg text-[11px] text-ink font-mono shadow-2xs"
                >
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="text-ink-tertiary hover:text-danger ml-0.5"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error & Recapture Banner */}
      {error && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-danger-light border border-danger/20 text-xs animate-fade-in">
          <p className="text-danger font-medium">{error}</p>
          {isDuplicate && (
            <button
              onClick={() => recaptureMutation.mutate(url.trim())}
              className="px-2.5 py-1 bg-surface-elevated border border-danger/30 text-danger hover:bg-danger hover:text-white rounded-lg text-xs font-medium transition-colors shrink-0 shadow-2xs"
            >
              Re-capture and overwrite
            </button>
          )}
        </div>
      )}
    </div>
  );
}
