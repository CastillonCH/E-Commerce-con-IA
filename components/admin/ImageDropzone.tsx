"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageDropzoneProps {
  onFileSelected: (file: File | null) => void;
  error?: string;
}

/** Zona de drag & drop para la foto del producto que el backend pasará por la red neuronal. */
export function ImageDropzone({ onFileSelected, error }: ImageDropzoneProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setPreview(URL.createObjectURL(file));
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxFiles: 1,
  });

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleRemove(event: React.MouseEvent) {
    event.stopPropagation();
    setPreview(null);
    onFileSelected(null);
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "relative flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          isDragActive ? "border-slate-900 bg-slate-50" : "border-slate-300",
          error && "border-red-400"
        )}
      >
        <input {...getInputProps()} />
        {preview ? (
          <>
            <div className="relative h-32 w-32 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview local vía blob: URL, next/image no la optimiza */}
              <img
                src={preview}
                alt="Vista previa del producto"
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-3 top-3 rounded-full bg-white p-1 shadow"
              aria-label="Quitar imagen"
            >
              <X className="h-4 w-4 text-slate-700" />
            </button>
          </>
        ) : (
          <>
            <ImagePlus className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">
              Arrastra la imagen aquí o haz clic para seleccionar
            </p>
            <p className="mt-1 text-xs text-slate-500">PNG, JPG o WEBP</p>
          </>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
