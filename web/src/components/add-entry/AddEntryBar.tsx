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
      {/* Top Input Bar: URL input + action button */}
      <form onSubmit={handleSubmit} className="flex gap-3 items-center">
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Paste a URL or drop screenshots below..."
          disabled={isPending}
          className="flex-1 px-4 py-2.5 bg-surface-elevated border border-border text-sm text-ink
            placeholder:text-ink-tertiary focus:outline-none focus:border-border-strong
            rounded-sm font-sans disabled:opacity-50 transition-colors"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="px-3 py-2.5 bg-surface-elevated border border-border text-xs text-ink-secondary hover:text-ink hover:border-border-strong rounded-sm transition-colors flex items-center gap-1.5 shrink-0"
          title="Upload or pick screenshots"
        >
          <Upload size={14} />
          <span>Upload</span>
        </button>

        <button
          type="submit"
          disabled={isPending || (!url.trim() && selectedFiles.length === 0)}
          className="px-4 py-2.5 bg-ink text-surface text-sm font-medium
            rounded-sm hover:bg-ink/90 disabled:opacity-30 transition-colors
            flex items-center gap-2 shrink-0"
        >
          {isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span className="font-mono text-xs">{elapsed}s</span>
            </>
          ) : (
            <>
              {selectedFiles.length > 0 ? "Save Entry" : "Capture"}
              <ArrowRight size={14} />
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

      {/* Drag & drop / paste dropzone & file chips */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        className={`border border-dashed rounded-sm p-3 transition-colors text-center text-xs ${
          isDragging
            ? "border-accent bg-accent-light/10 text-ink"
            : "border-border hover:border-border-strong bg-surface/50 text-ink-tertiary"
        }`}
      >
        {selectedFiles.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <ImageIcon size={14} />
            <span>
              Drag & drop screenshots here, or paste directly with{" "}
              <kbd className="font-mono text-[11px] bg-surface-elevated border border-border px-1 py-0.5 rounded">
                Ctrl+V
              </kbd>
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-secondary pb-1 border-b border-border">
              <span>{selectedFiles.length} screenshot(s) ready</span>
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                className="text-danger hover:underline text-[11px]"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1 max-h-32 overflow-y-auto">
              {selectedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-1.5 px-2 py-1 bg-surface-elevated border border-border rounded text-[11px] text-ink font-mono"
                >
                  <span className="truncate max-w-[140px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="text-ink-tertiary hover:text-danger"
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
        <div className="flex items-start gap-2 text-xs">
          <p className="text-danger">{error}</p>
          {isDuplicate && (
            <button
              onClick={() => recaptureMutation.mutate(url.trim())}
              className="text-accent hover:underline shrink-0 text-xs font-medium"
            >
              Re-capture and overwrite
            </button>
          )}
        </div>
      )}
    </div>
  );
}
