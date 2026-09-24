"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@/types";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/shop/ProductCard";

interface ProductCarouselProps {
  title: string;
  products: Product[];
  viewAllHref?: string;
}

/**
 * Carrusel horizontal con scroll-snap nativo (sin librería nueva): cada
 * tarjeta ocupa un ancho fijo y `scroll-snap-type` la alinea al soltar el
 * scroll. Las flechas solo desplazan el contenedor con `scrollBy` — no hay
 * estado de "página actual" que pueda desincronizarse de un swipe manual en
 * móvil, que sigue funcionando igual con o sin JS.
 */
export function ProductCarousel({ title, products, viewAllHref }: ProductCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function updateEdges() {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-carousel-item]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * step * 2, behavior: "smooth" });
  }

  if (products.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <div className="flex items-center gap-2">
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="hidden text-sm font-medium text-brand hover:underline sm:block"
            >
              Ver todo
            </Link>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => scrollByCards(-1)}
              disabled={atStart}
              aria-label="Anterior"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-50",
                "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:bg-transparent"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByCards(1)}
              disabled={atEnd}
              aria-label="Siguiente"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-50",
                "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-slate-300 disabled:hover:bg-transparent"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={updateEdges}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((product) => (
          <div
            key={product.id}
            data-carousel-item
            className="w-[220px] shrink-0 snap-start sm:w-[240px]"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
