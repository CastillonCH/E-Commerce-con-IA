"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <p className="text-lg font-medium text-slate-900">Algo salió mal</p>
      <p className="text-sm text-slate-500">
        No pudimos cargar esta página. Intenta de nuevo.
      </p>
      <Button onClick={reset} className="mt-2">
        Reintentar
      </Button>
    </div>
  );
}
