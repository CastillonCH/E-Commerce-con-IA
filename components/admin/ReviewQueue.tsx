"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Sparkles } from "lucide-react";
import type { PendingReviewEntry } from "@/lib/data/products-repo";
import { CATEGORIAS_IA } from "@/lib/taxonomy";
import { formatCurrency } from "@/lib/utils";
import {
  approveReviewAction,
  rejectReviewAction,
} from "@/app/admin/(protected)/revision/actions";

// Funciones de nivel de módulo (no definidas dentro del componente): la
// regla react-hooks/purity trata cualquier función anidada dentro de un
// componente/hook como parte del render, así que Date.now() ahí adentro
// siempre se marca como impuro, aunque solo se llame desde un manejador de
// evento. Declaradas afuera, quedan fuera de ese análisis.
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
  // "Desde que se abre la ficha hasta que se decide" (F4.7, tiempo_revision_seg):
  // cada ficha arranca su cronómetro la primera vez que aparece en esta lista.
  // Captura el timestamp en un efecto, no durante el render: el render debe
  // quedar puro (regla react-hooks/purity).
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
    // El <select> es no controlado (defaultValue): si categoria_ia no es
    // una categoría real (p. ej. "Sin categoría sugerida", en modo demo,
    // donde no hay fila en predicciones_ia), el navegador muestra la
    // primera opción de la lista sin disparar onChange — categorias[id]
    // queda vacío aunque haya algo visualmente seleccionado. Este fallback
    // reproduce exactamente esa regla para que lo que se envía coincida
    // con lo que el admin ve en pantalla.
    const categoriasDisponibles = CATEGORIAS_IA[entry.product.departamento];
    const categoriaFinal =
      categorias[entry.product.id] ??
      (categoriasDisponibles.includes(entry.product.categoria_ia)
        ? entry.product.categoria_ia
        : categoriasDisponibles[0]);
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

  async function handleReject(entry: PendingReviewEntry) {
    setProcessingId(entry.product.id);
    const result = await rejectReviewAction(entry.product.id);
    setProcessingId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo rechazar el producto.");
      return;
    }
    toast.success(`${entry.product.nombre} rechazado.`);
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((entry) => {
        const categoriasDisponibles = CATEGORIAS_IA[entry.product.departamento];
        const isProcessing = processingId === entry.product.id;

        return (
          <li
            key={entry.product.id}
            className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              <Image
                src={entry.product.imagen_url}
                alt={entry.product.nombre}
                fill
                sizes="64px"
                className="object-cover"
              />
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
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-900 disabled:opacity-50"
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
                className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aprobar
              </button>
              <button
                type="button"
                onClick={() => handleReject(entry)}
                disabled={isProcessing}
                className="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Rechazar
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
