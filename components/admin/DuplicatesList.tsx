"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { DuplicatePair } from "@/lib/data/products-repo";
import type { Product } from "@/types";
import { deleteProduct, getApiErrorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function ProductCell({ product }: { product: Product }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        <Image
          src={product.imagen_url}
          alt={product.nombre}
          fill
          sizes="48px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">
          {product.nombre}
        </p>
        <p className="text-xs text-slate-500">{formatCurrency(product.precio)}</p>
      </div>
    </div>
  );
}

export function DuplicatesList({ pairs }: { pairs: DuplicatePair[] }) {
  const router = useRouter();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visiblePairs = pairs.filter(
    (pair) => !removed.has(pair.a.id) && !removed.has(pair.b.id),
  );

  async function confirmDelete() {
    const product = pendingDelete;
    if (!product) return;
    setPendingDelete(null);

    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      setRemoved((prev) => new Set(prev).add(product.id));
      toast.success(`${product.nombre} eliminado`);
      router.refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  if (visiblePairs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No se detectaron posibles duplicados.
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {visiblePairs.map((pair) => (
          <li
            key={`${pair.a.id}-${pair.b.id}`}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="mb-3 text-xs font-medium text-amber-700">
              {Math.round(pair.score * 100)}% de similitud · {pair.a.marca}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[pair.a, pair.b].map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"
                >
                  <ProductCell product={product} />
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/admin/productos/${product.id}/editar`}
                      aria-label={`Editar ${product.nombre}`}
                      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(product)}
                      disabled={deletingId === product.id}
                      aria-label={`Eliminar ${product.nombre}`}
                      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar producto"
        description={
          pendingDelete
            ? `¿Eliminar "${pendingDelete.nombre}"? Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
