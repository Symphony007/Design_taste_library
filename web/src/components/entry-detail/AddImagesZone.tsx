import { useState, useRef } from "react";
import { Upload, Loader2, Image as ImageIcon } from "lucide-react";

interface AddImagesZoneProps {
  onUpload: (files: File[]) => Promise<void>;
  isUploading?: boolean;
}

export default function AddImagesZone({ onUpload, isUploading }: AddImagesZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(f.name)
    );

    if (files.length > 0) {
      await onUpload(files);
    }
  }

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      await onUpload(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`border border-dashed rounded-sm p-4 text-center transition-colors ${
        isDragging
          ? "border-accent bg-accent-light/10 text-ink"
          : "border-border hover:border-border-strong bg-surface-elevated/40 text-ink-secondary"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={handleSelect}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center gap-2">
        {isUploading ? (
          <div className="flex items-center gap-2 text-xs font-mono text-ink-secondary py-2">
            <Loader2 size={15} className="animate-spin text-accent" />
            <span>Processing and optimizing screenshots...</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <ImageIcon size={14} />
              <span>Drag & drop additional screenshots here, or</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-accent hover:underline font-medium inline-flex items-center gap-1"
              >
                <Upload size={12} />
                <span>browse files</span>
              </button>
            </div>
            <p className="text-[11px] text-ink-tertiary">
              Accepts PNG, JPG, or WebP. Screenshots are verified and appended in order.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
