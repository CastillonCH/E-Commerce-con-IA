"use client";

import Image from "next/image";
import { toast } from "sonner";
import { ShoppingCart, Star, Truck } from "lucide-react";
import type { Product } from "@/types";
import { discountPercent, formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { Button } from "@/components/ui/Button";

export function ProductCard({ product }: { product: Product }) {
  const addItem = useCartStore((state) => state.addItem);
  const discount = discountPercent(product.precio, product.precioOriginal);

  function handleAddToCart() {
    addItem(product);
    toast.success(`${product.nombre} añadido al carrito`);
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
        <Image
          src={product.imagen_url}
          alt={product.nombre}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />

        <div className="absolute left-2 top-2 flex flex-col gap-1.5">
          {discount && (
            <span className="rounded-full bg-orange-500 px-2 py-1 text-xs font-bold text-slate-950">
              -{discount}%
            </span>
          )}
          {product.esNuevo && (
            <span className="rounded-full bg-brand px-2 py-1 text-xs font-bold text-white">
              Nuevo
            </span>
          )}
        </div>

        {product.stock === 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-white">
            Agotado
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {product.marca}
        </span>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-slate-900">
          {product.nombre}
        </h3>

        {product.rating !== undefined && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Star className="h-3.5 w-3.5 fill-orange-400 text-orange-400" />
            <span className="font-medium text-slate-700">{product.rating.toFixed(1)}</span>
            {product.numResenas !== undefined && <span>({product.numResenas})</span>}
          </div>
        )}

        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-lg font-bold text-slate-900">{formatCurrency(product.precio)}</p>
          {product.precioOriginal && (
            <p className="text-xs text-slate-500 line-through">
              {formatCurrency(product.precioOriginal)}
            </p>
          )}
        </div>

        {product.envioGratis && (
          <p className="flex items-center gap-1 text-xs font-medium text-green-700">
            <Truck className="h-3.5 w-3.5" />
            Envío gratis
          </p>
        )}

        <Button
          onClick={handleAddToCart}
          disabled={product.stock === 0}
          className="mt-auto w-full"
        >
          <ShoppingCart className="h-4 w-4" />
          Añadir al carrito
        </Button>
      </div>
    </article>
  );
}
