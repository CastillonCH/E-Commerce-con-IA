"use client";

import { useEffect } from "react";

export default function AdminError({
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-lg font-medium text-slate-900">Algo salió mal</p>
      <p className="text-sm text-slate-500">
        No pudimos cargar esta sección del panel.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
      >
        Reintentar
      </button>
    </div>
  );
}
