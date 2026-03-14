"use client";

/**
 * Slipdesk — LogoUploader
 * Drag & drop company logo upload → Supabase Storage.
 * Place at: src/components/LogoUploader.tsx
 *
 * Supabase bucket setup required:
 *   - Bucket name: "company-assets"
 *   - Policy: authenticated users can INSERT/UPDATE their own files
 */

import { useCallback, useRef, useState } from "react";
import { Upload, X, CheckCircle2, Loader, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface LogoUploaderProps {
  currentLogoUrl: string | null;
  onUploadComplete: (url: string) => void;
}

const BUCKET    = "company-assets";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED   = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export default function LogoUploader({ currentLogoUrl, onUploadComplete }: LogoUploaderProps) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [preview,  setPreview]  = useState<string | null>(currentLogoUrl);

  const upload = useCallback(async (file: File) => {
    setError(null);

    if (!ALLOWED.includes(file.type)) {
      setError("Only PNG, JPG, SVG, or WebP files are allowed.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File must be under 2 MB.");
      return;
    }

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setLoading(true);

    try {
      const supabase  = createClient();
      const ext       = file.name.split(".").pop();
      const path      = `logos/company-logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      // Bust cache with timestamp so PDF always gets the latest
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      onUploadComplete(publicUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      setPreview(currentLogoUrl); // revert preview
    } finally {
      setLoading(false);
    }
  }, [currentLogoUrl, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [upload]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  const clear = () => {
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      {/* Current / preview */}
      {preview ? (
        <div className="relative w-40 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Company logo" className="max-h-16 max-w-36 object-contain" />
          {!loading && (
            <button
              onClick={clear}
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white shadow border border-slate-200
                         flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
          {loading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader className="w-5 h-5 animate-spin text-[#50C878]" />
            </div>
          )}
        </div>
      ) : (
        /* Drop zone */
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`w-full rounded-xl border-2 border-dashed cursor-pointer transition-all
            flex flex-col items-center justify-center gap-2 py-8 px-4
            ${dragging
              ? "border-[#50C878] bg-emerald-50"
              : "border-slate-200 hover:border-[#50C878] hover:bg-slate-50"}`}
        >
          <ImageIcon className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Drop your logo here</p>
          <p className="text-xs text-slate-400">PNG, JPG, SVG, WebP · max 2 MB</p>
          <span className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
                           bg-[#002147] text-white hover:bg-[#002147]/80 transition-colors">
            <Upload className="w-3.5 h-3.5" /> Browse files
          </span>
        </div>
      )}

      <input ref={fileRef} type="file" accept={ALLOWED.join(",")} className="hidden" onChange={handleChange} />

      {/* Status */}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1.5">
          <X className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </p>
      )}
      {!loading && !error && preview && (
        <p className="text-xs text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Logo saved — will appear on payslips
        </p>
      )}
    </div>
  );
}