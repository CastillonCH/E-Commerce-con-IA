"use client";

import Image from "next/image";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import type { Product } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { Button } from "@/components/ui/Button";

export function ProductCard({ product }: { product: Product }) {
  const addItem = useCartStore((state) => state.addItem);

  function handleAddToCart() {
    addItem(product);
    toast.success(`${product.nombre} añadido al carrito`);
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
        <Image
          src={product.imagen_url}
          alt={product.nombre}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {product.stock === 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-white">
            Agotado
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {product.marca}
        </span>
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
          {product.nombre}
        </h3>
        <p className="mt-1 text-lg font-bold text-slate-900">
          {formatCurrency(product.precio)}
        </p>

        <Button
          onClick={handleAddToCart}
          disabled={product.stock === 0}
          className="mt-3 w-full"
        >
          <ShoppingCart className="h-4 w-4" />
          Añadir al carrito
        </Button>
      </div>
    </article>
  );
}
