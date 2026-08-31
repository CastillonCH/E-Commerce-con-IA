"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCartStore } from "@/store/cart-store";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const totalPrice = useCartStore((state) => state.totalPrice());

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <p className="text-lg font-medium text-slate-900">Tu carrito está vacío</p>
        <Link href="/" className="text-sm font-medium text-brand hover:underline">
          Volver a la tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Tu carrito</h1>

      <ul className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {items.map(({ product, cantidad }) => (
          <li key={product.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium text-slate-900">{product.nombre}</p>
              <p className="text-xs text-slate-500">
                {cantidad} x {formatCurrency(product.precio)}
              </p>
            </div>
            <button
              onClick={() => removeItem(product.id)}
              aria-label="Quitar del carrito"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-lg font-semibold text-slate-900">
          Total: {formatCurrency(totalPrice)}
        </p>
        <Button>Ir a pagar</Button>
      </div>
    </div>
  );
}
