"use client";

import { useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, SlidersHorizontal, Star, X } from "lucide-react";
import {
  ORDENES,
  RATINGS_MINIMOS,
  buildCatalogSearch,
  hasActiveFilters,
  type CatalogQuery,
  type MarcaFacet,
  type Orden,
} from "@/lib/catalog-filters";
import { cn } from "@/lib/utils";

function useCatalogNavigation(query: CatalogQuery) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function aplicar(cambios: Partial<CatalogQuery>) {
    startTransition(() => {
      router.push(`${pathname}${buildCatalogSearch(query, cambios)}`, { scroll: false });
    });
  }

  return { aplicar, pending };
}

function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group/sec border-b border-slate-200 py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open/sec:rotate-180" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function CatalogFilters({
  query,
  marcas,
  children,
}: {
  query: CatalogQuery;
  marcas: MarcaFacet[];
  // Secciones renderizadas en el servidor (p. ej. la lista de categorías).
  children?: ReactNode;
}) {
  const { aplicar, pending } = useCatalogNavigation(query);
  const [abierto, setAbierto] = useState(false);
  const [min, setMin] = useState(query.precioMin?.toString() ?? "");
  const [max, setMax] = useState(query.precioMax?.toString() ?? "");
  const activos = hasActiveFilters(query);

  function toggleMarca(marca: string) {
    const seleccionadas = query.marcas.includes(marca)
      ? query.marcas.filter((m) => m !== marca)
      : [...query.marcas, marca];
    aplicar({ marcas: seleccionadas });
  }

  function aplicarPrecio(event: React.FormEvent) {
    event.preventDefault();
    const aNumero = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v)));
    let precioMin = aNumero(min);
    let precioMax = aNumero(max);
    if (precioMin !== undefined && precioMax !== undefined && precioMin > precioMax) {
      [precioMin, precioMax] = [precioMax, precioMin];
    }
    aplicar({ precioMin, precioMax });
  }

  function limpiar() {
    setMin("");
    setMax("");
    aplicar({
      marcas: [],
      precioMin: undefined,
      precioMax: undefined,
      ratingMin: undefined,
      soloOfertas: false,
      envioGratis: false,
    });
  }

  return (
    <div className={cn(pending && "opacity-60 transition-opacity")}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-900 lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" />
        {abierto ? "Ocultar filtros" : "Filtrar"}
        {activos && <span className="h-2 w-2 rounded-full bg-brand" />}
      </button>

      <div className={cn("mt-2 lg:mt-0 lg:block", abierto ? "block" : "hidden")}>
        {activos && (
          <button
            type="button"
            onClick={limpiar}
            className="mb-1 flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </button>
        )}

        {children}

        <FilterSection title="Envío y ofertas">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => aplicar({ envioGratis: !query.envioGratis })}
              aria-pressed={query.envioGratis}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                query.envioGratis
                  ? "border-brand bg-brand/10 font-medium text-brand"
                  : "border-slate-300 text-slate-700 hover:border-slate-900",
              )}
            >
              Envío gratis
            </button>
            <button
              type="button"
              onClick={() => aplicar({ soloOfertas: !query.soloOfertas })}
              aria-pressed={query.soloOfertas}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                query.soloOfertas
                  ? "border-brand bg-brand/10 font-medium text-brand"
                  : "border-slate-300 text-slate-700 hover:border-slate-900",
              )}
            >
              En oferta
            </button>
          </div>
        </FilterSection>

        {marcas.length > 0 && (
          <FilterSection title="Marca">
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
              {marcas.map(({ marca, cantidad }) => (
                <li key={marca}>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={query.marcas.includes(marca)}
                      onChange={() => toggleMarca(marca)}
                      className="h-4 w-4 rounded border-slate-300 accent-brand"
                    />
                    <span className="flex-1 truncate">{marca}</span>
                    <span className="text-xs text-slate-500">({cantidad})</span>
                  </label>
                </li>
              ))}
            </ul>
          </FilterSection>
        )}

        <FilterSection title="Precio">
          <form onSubmit={aplicarPrecio} className="flex items-end gap-2">
            <label className="flex-1 text-xs text-slate-500">
              Mínimo
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                placeholder="S/ 0"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </label>
            <label className="flex-1 text-xs text-slate-500">
              Máximo
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                placeholder="Sin límite"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black"
            >
              Ir
            </button>
          </form>
        </FilterSection>

        <FilterSection title="Calificación">
          <ul className="flex flex-col gap-1.5">
            {RATINGS_MINIMOS.map((rating) => (
              <li key={rating}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="rating"
                    checked={query.ratingMin === rating}
                    onChange={() => aplicar({ ratingMin: rating })}
                    onClick={() => {
                      if (query.ratingMin === rating) aplicar({ ratingMin: undefined });
                    }}
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="flex" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-4 w-4",
                          i < rating ? "fill-orange-400 text-orange-400" : "fill-slate-200 text-slate-200",
                        )}
                      />
                    ))}
                  </span>
                  <span>{rating} y más</span>
                </label>
              </li>
            ))}
          </ul>
        </FilterSection>
      </div>
    </div>
  );
}

export function CatalogSort({ query }: { query: CatalogQuery }) {
  const { aplicar } = useCatalogNavigation(query);
  return (
    <label className="flex items-center gap-2 text-sm text-slate-500">
      Ordenar por:
      <select
        value={query.orden}
        onChange={(e) => aplicar({ orden: e.target.value as Orden })}
        className="rounded-lg border border-slate-300 bg-white py-1.5 pl-2.5 pr-8 text-sm font-semibold text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      >
        {ORDENES.map((orden) => (
          <option key={orden.value} value={orden.value}>
            {orden.label}
          </option>
        ))}
      </select>
    </label>
  );
}
