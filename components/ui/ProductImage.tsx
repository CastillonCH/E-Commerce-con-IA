"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

// next/image para fotos de productos que puede que no existan (URL vacía,
// archivo borrado de public/uploads, host caído...). En vez del ícono roto
// del navegador con el texto alternativo cortado ("Zapatil..."), muestra un
// marcador "Sin foto" que ocupa el mismo lugar. El contenedor debe ser
// `relative` cuando se usa `fill`, igual que con next/image.
export function ProductImage({ src, alt, className, ...props }: ImageProps) {
  const [fallo, setFallo] = useState(false);

  if (!src || fallo) {
    return (
      <div
        role="img"
        aria-label={`${alt} (sin foto)`}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400"
      >
        <ImageOff className="h-1/3 max-h-10 w-1/3 max-w-10" aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      onError={() => setFallo(true)}
      className={cn(className)}
      {...props}
    />
  );
}
