"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import type { Product } from "@/types";
import { useCartStore } from "@/store/cart-store";
import { Button } from "@/components/ui/Button";

export function ProductDetailActions({ product }: { product: Product }) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [cantidad, setCantidad] = useState(1);
  const agotado = product.stock === 0;

  function addToCart() {
    for (let i = 0; i < cantidad; i++) addItem(product);
    toast.success(`${product.nombre} añadido al carrito`);
  }

  function comprarAhora() {
    addToCart();
    router.push("/checkout");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700">Cantidad</span>
        <div className="flex items-center rounded-full border border-slate-300">
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.max(1, c - 1))}
            disabled={cantidad <= 1}
            aria-label="Disminuir cantidad"
            className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center text-sm font-semibold text-slate-900">
            {cantidad}
          </span>
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.min(product.stock, c + 1))}
            disabled={cantidad >= product.stock}
            aria-label="Aumentar cantidad"
            className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-xs text-slate-500">
          {product.stock} disponibles
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={addToCart}
          disabled={agotado}
          variant="outline"
          className="flex-1"
        >
          <ShoppingCart className="h-4 w-4" />
          Añadir al carrito
        </Button>
        <Button onClick={comprarAhora} disabled={agotado} className="flex-1">
          {agotado ? "Agotado" : "Comprar ahora"}
        </Button>
      </div>
    </div>
  );
}
