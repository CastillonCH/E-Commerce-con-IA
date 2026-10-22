"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import type { DetectedDuplicate, DuplicateProductSummary } from "@/lib/data/products-repo";
import { resolveDuplicateAction } from "@/app/admin/(protected)/duplicados/actions";

function ProductCell({ product }: { product: DuplicateProductSummary }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {product.imagenUrl ? (
          <Image src={product.imagenUrl} alt={product.nombre} fill sizes="48px" unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">Sin foto</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{product.nombre}</p>
        <p className="text-xs text-slate-500">{product.marca}</p>
      </div>
    </div>
  );
}

export function DuplicatesList({ pairs }: { pairs: DetectedDuplicate[] }) {
  const router = useRouter();
  const [resueltos, setResueltos] = useState<Set<number>>(new Set());
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  const visibles = pairs.filter((par) => par.estado === "pendiente" && !resueltos.has(par.id));

  async function resolver(id: number, estado: "confirmado" | "descartado", nombre: string) {
    setProcesandoId(id);
    const result = await resolveDuplicateAction(id, estado);
    setProcesandoId(null);

    if (!result.success) {
      toast.error(result.error ?? "No se pudo registrar la decisión.");
      return;
    }
    setResueltos((prev) => new Set(prev).add(id));
    toast.success(
      estado === "confirmado" ? `Confirmado como duplicado: ${nombre}` : `Descartado: ${nombre} no es un duplicado`,
    );
    router.refresh();
  }

  if (visibles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No hay pares pendientes de revisar.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {visibles.map((par) => {
        const procesando = procesandoId === par.id;
        return (
          <li key={par.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-xs font-medium text-amber-700">
              {Math.round(par.similitudCombinada * 100)}% de similitud combinada
              {par.similitudImagen !== null && ` · imagen ${Math.round(par.similitudImagen * 100)}%`}
              {par.similitudTexto !== null && ` · texto ${Math.round(par.similitudTexto * 100)}%`}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[par.a, par.b].map((product) => (
                <div key={product.id} className="rounded-lg border border-slate-100 p-3">
                  <ProductCell product={product} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => resolver(par.id, "confirmado", par.a.nombre)}
                disabled={procesando}
                className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Es duplicado
              </button>
              <button
                type="button"
                onClick={() => resolver(par.id, "descartado", par.a.nombre)}
                disabled={procesando}
                className="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                No es duplicado
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
