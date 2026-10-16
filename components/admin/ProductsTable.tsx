"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import type { Product } from "@/types";
import { deleteProductAction } from "@/app/admin/(protected)/productos/actions";
import { formatCurrency } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function ProductsTable({ products }: { products: Product[] }) {
  const [items, setItems] = useState(products);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  async function confirmDelete() {
    const product = pendingDelete;
    if (!product) return;
    setPendingDelete(null);

    setDeletingId(product.id);
    const result = await deleteProductAction(product.id);
    setDeletingId(null);

    if (!result.success) {
      toast.error(result.error ?? "No se pudo eliminar el producto.");
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== product.id));
    toast.success("Producto eliminado");
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">Lista de productos publicados</caption>
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th scope="col" className="px-4 py-3 font-medium">Producto</th>
            <th scope="col" className="px-4 py-3 font-medium">Marca</th>
            <th scope="col" className="px-4 py-3 font-medium">Departamento</th>
            <th scope="col" className="px-4 py-3 font-medium">Categoría IA</th>
            <th scope="col" className="px-4 py-3 font-medium">Precio</th>
            <th scope="col" className="px-4 py-3 font-medium">Stock</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => (
            <tr
              key={product.id}
              className="border-b border-slate-100 text-slate-700 last:border-0"
            >
              <td className="px-4 py-3">{product.nombre}</td>
              <td className="px-4 py-3">{product.marca}</td>
              <td className="px-4 py-3">{product.departamento}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                  {product.categoria_ia}
                </span>
              </td>
              <td className="px-4 py-3">{formatCurrency(product.precio)}</td>
              <td className="px-4 py-3">{product.stock}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1.5">
                  <Link
                    href={`/admin/productos/${product.id}/editar`}
                    aria-label="Editar producto"
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(product)}
                    disabled={deletingId === product.id}
                    aria-label="Eliminar producto"
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    {deletingId === product.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
    </div>
  );
}
