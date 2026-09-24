"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import type { Product } from "@/types";
import { deleteProduct, getApiErrorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export function ProductsTable({ products }: { products: Product[] }) {
  const [items, setItems] = useState(products);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(product: Product) {
    if (!confirm(`¿Eliminar "${product.nombre}"? Esta acción no se puede deshacer.`)) return;

    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      setItems((prev) => prev.filter((p) => p.id !== product.id));
      toast.success("Producto eliminado");
    } catch (error) {
      // Hasta que exista el backend, este endpoint no existe y siempre
      // fallará aquí: es el comportamiento esperado, no un bug del frontend.
      toast.error(getApiErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="px-4 py-3 font-medium">Producto</th>
            <th className="px-4 py-3 font-medium">Marca</th>
            <th className="px-4 py-3 font-medium">Departamento</th>
            <th className="px-4 py-3 font-medium">Categoría IA</th>
            <th className="px-4 py-3 font-medium">Precio</th>
            <th className="px-4 py-3 font-medium">Stock</th>
            <th className="px-4 py-3 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => (
            <tr key={product.id} className="border-b border-slate-100 text-slate-700 last:border-0">
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
                    onClick={() => handleDelete(product)}
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
    </div>
  );
}
