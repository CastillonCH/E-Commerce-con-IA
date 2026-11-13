"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/ui/ProductImage";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Sparkles } from "lucide-react";
import type { PendingReviewEntry } from "@/lib/data/products-repo";
import { CATEGORIAS_IA } from "@/lib/taxonomy";
import { MOTIVOS_RECHAZO } from "@/lib/catalogo";
import { formatCurrency } from "@/lib/utils";
import {
  approveReviewAction,
  rejectReviewAction,
} from "@/app/admin/(protected)/revision/actions";

function marcaDeTiempoActual(): number {
  return Date.now();
}
function segundosTranscurridosDesde(inicioMs: number): number {
  return Math.round((marcaDeTiempoActual() - inicioMs) / 1000);
}

export function ReviewQueue({ items }: { items: PendingReviewEntry[] }) {
  const router = useRouter();
  const [categorias, setCategorias] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  // Producto que se está rechazando (muestra el selector de motivo).
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_RECHAZO[0]);
  const [motivoLibre, setMotivoLibre] = useState("");
  const tiemposInicio = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const entry of items) {
      tiemposInicio.current[entry.product.id] ??= marcaDeTiempoActual();
    }
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No hay productos pendientes de revisión.
      </div>
    );
  }

  async function handleApprove(entry: PendingReviewEntry) {
    setProcessingId(entry.product.id);
    const categoriasDisponibles = CATEGORIAS_IA[entry.product.departamento] || [];
    const categoriaFinal =
      categorias[entry.product.id] ??
      (categoriasDisponibles.includes(entry.product.categoria_ia)
        ? entry.product.categoria_ia
        : categoriasDisponibles[0] || entry.product.categoria_ia);
    const inicio = tiemposInicio.current[entry.product.id] ?? marcaDeTiempoActual();
    const tiempoRevisionSeg = segundosTranscurridosDesde(inicio);
    const result = await approveReviewAction(entry.product.id, categoriaFinal, tiempoRevisionSeg);
    setProcessingId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo aprobar el producto.");
      return;
    }
    toast.success(`${entry.product.nombre} publicado en la tienda.`);
    router.refresh();
  }

  function abrirRechazo(entry: PendingReviewEntry) {
    setRechazandoId(entry.product.id);
    setMotivo(MOTIVOS_RECHAZO[0]);
    setMotivoLibre("");
  }

  async function handleReject(entry: PendingReviewEntry) {
    const texto = motivo === "otro" ? motivoLibre.trim() : motivo;
    setProcessingId(entry.product.id);
    const result = await rejectReviewAction(entry.product.id, texto);
    setProcessingId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo rechazar el producto.");
      return;
    }
    toast.success(`${entry.product.nombre} rechazado. El personal de catálogo verá el motivo.`);
    setRechazandoId(null);
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((entry) => {
        const categoriasDisponibles = CATEGORIAS_IA[entry.product.departamento] || [];
        const isProcessing = processingId === entry.product.id;

        return (
          <li key={entry.product.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              {entry.product.imagen_url ? (
                <ProductImage
                  src={entry.product.imagen_url}
                  alt={entry.product.nombre}
                  fill
                  sizes="64px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                  Sin foto
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {entry.product.nombre}
              </p>
              <p className="text-xs text-slate-500">
                {entry.product.marca} · {formatCurrency(entry.product.precio)}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <Sparkles className="h-3.5 w-3.5" />
                IA sugirió &ldquo;{entry.product.categoria_ia}&rdquo; con{" "}
                {Math.round(entry.confidence * 100)}% de confianza
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`categoria-${entry.product.id}`}>
                Categoría final para {entry.product.nombre}
              </label>
              <select
                id={`categoria-${entry.product.id}`}
                defaultValue={entry.product.categoria_ia}
                disabled={isProcessing}
                onChange={(event) =>
                  setCategorias((prev) => ({
                    ...prev,
                    [entry.product.id]: event.target.value,
                  }))
                }
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900 disabled:opacity-50"
              >
                {categoriasDisponibles.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleApprove(entry)}
                disabled={isProcessing}
                className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aprobar
              </button>
              <button
                type="button"
                onClick={() => abrirRechazo(entry)}
                disabled={isProcessing || rechazandoId === entry.product.id}
                className="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Rechazar
              </button>
            </div>
          </div>

          {rechazandoId === entry.product.id && (
            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor={`motivo-${entry.product.id}`} className="mb-1 block text-sm font-medium text-red-800">
                  Motivo del rechazo
                </label>
                <select
                  id={`motivo-${entry.product.id}`}
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  disabled={isProcessing}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900"
                >
                  {MOTIVOS_RECHAZO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value="otro">Otro motivo…</option>
                </select>
                {motivo === "otro" && (
                  <input
                    type="text"
                    aria-label="Escribe el motivo"
                    value={motivoLibre}
                    onChange={(event) => setMotivoLibre(event.target.value)}
                    maxLength={300}
                    placeholder="Escribe el motivo"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleReject(entry)}
                  disabled={isProcessing || (motivo === "otro" && motivoLibre.trim().length < 5)}
                  className="rounded-full bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirmar rechazo
                </button>
                <button
                  type="button"
                  onClick={() => setRechazandoId(null)}
                  disabled={isProcessing}
                  className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          </li>
        );
      })}
    </ul>
  );
}
