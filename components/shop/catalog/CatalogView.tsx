import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import type { Product } from "@/types";
import {
  applyCatalogQuery,
  buildCatalogSearch,
  hasActiveFilters,
  marcaFacets,
  paginate,
  type CatalogQuery,
} from "@/lib/catalog-filters";
import { APP_CONFIG } from "@/lib/config";
import { formatCurrency, cn } from "@/lib/utils";
import { ProductCard } from "@/components/shop/ProductCard";
import { Pagination } from "@/components/shop/Pagination";
import { CatalogFilters, CatalogSort } from "@/components/shop/catalog/CatalogFilters";

export interface Miga {
  label: string;
  href?: string;
}

export interface EnlaceAlcance {
  label: string;
  href: string;
  activo: boolean;
}

// Vista de listado estilo Falabella (ruta de navegación, filtros a la
// izquierda, orden y paginación arriba, grilla de productos). La usan el
// catálogo completo (/productos) y las páginas de departamento/categoría:
// cada una decide qué productos entran ("enAlcance") y qué enlaces de
// alcance mostrar (departamentos o categorías).
export function CatalogView({
  titulo,
  subtitulo,
  migas,
  enAlcance,
  query,
  basePath,
  alcance,
  vacio,
}: {
  titulo: string;
  subtitulo: string;
  migas: Miga[];
  enAlcance: Product[];
  query: CatalogQuery;
  basePath: string;
  alcance: { titulo: string; enlaces: EnlaceAlcance[] };
  vacio: { titulo: string; detalle: string };
}) {
  const resultado = applyCatalogQuery(enAlcance, query);
  const { items, currentPage, totalPages } = paginate(
    resultado,
    query.page,
    APP_CONFIG.productsPerPage,
  );
  const buildPageHref = (page: number) => `${basePath}${buildCatalogSearch(query, { page })}`;

  return (
    <div className="flex-1 bg-slate-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <nav aria-label="Ruta de navegación" className="mb-4">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
            {migas.map((miga, i) => (
              <li key={miga.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />}
                {miga.href ? (
                  <Link href={miga.href} className="hover:text-brand hover:underline">
                    {miga.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium text-slate-900">
                    {miga.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="h-fit rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-2">
              <p className="text-sm text-slate-500">{subtitulo}</p>
              <h1 className="text-2xl font-bold leading-tight text-slate-900">{titulo}</h1>
              <p className="mt-2 text-sm text-slate-500">Resultados ({resultado.length})</p>
            </div>

            <CatalogFilters query={query} marcas={marcaFacets(enAlcance)}>
              <details open className="group/sec border-b border-slate-200 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  {alcance.titulo}
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {alcance.enlaces.map((enlace) => (
                    <Link
                      key={enlace.href}
                      href={enlace.href}
                      aria-current={enlace.activo ? "page" : undefined}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        enlace.activo
                          ? "border-brand bg-brand/10 font-medium text-brand"
                          : "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-900",
                      )}
                    >
                      {enlace.label}
                    </Link>
                  ))}
                </div>
              </details>
            </CatalogFilters>
          </aside>

          <section aria-label={`Productos de ${titulo}`} className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white px-5 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <CatalogSort query={query} />
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                buildHref={buildPageHref}
                className="mt-0 justify-start sm:justify-end"
              />
            </div>

            <FiltrosActivos query={query} basePath={basePath} />

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-white py-24 text-center shadow-sm">
                <p className="text-lg font-medium text-slate-900">
                  {enAlcance.length === 0 ? vacio.titulo : "Ningún producto coincide con los filtros"}
                </p>
                <p className="text-sm text-slate-500">
                  {enAlcance.length === 0 ? vacio.detalle : "Prueba quitando algún filtro."}
                </p>
                {hasActiveFilters(query) && (
                  <Link
                    href={basePath}
                    className="mt-2 text-sm font-semibold text-brand hover:underline"
                  >
                    Limpiar filtros
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}

            <Pagination page={currentPage} totalPages={totalPages} buildHref={buildPageHref} />
          </section>
        </div>
      </div>
    </div>
  );
}

// Chips de lo que está filtrado, cada uno con su "x" para quitarlo.
function FiltrosActivos({ query, basePath }: { query: CatalogQuery; basePath: string }) {
  const chips: { label: string; href: string }[] = [];
  for (const marca of query.marcas) {
    chips.push({
      label: marca,
      href: basePath + buildCatalogSearch(query, { marcas: query.marcas.filter((m) => m !== marca) }),
    });
  }
  if (query.precioMin !== undefined || query.precioMax !== undefined) {
    const desde = query.precioMin !== undefined ? formatCurrency(query.precioMin) : "S/ 0";
    const hasta = query.precioMax !== undefined ? formatCurrency(query.precioMax) : "más";
    chips.push({
      label: `${desde} – ${hasta}`,
      href: basePath + buildCatalogSearch(query, { precioMin: undefined, precioMax: undefined }),
    });
  }
  if (query.ratingMin !== undefined) {
    chips.push({
      label: `${query.ratingMin}★ y más`,
      href: basePath + buildCatalogSearch(query, { ratingMin: undefined }),
    });
  }
  if (query.soloOfertas) {
    chips.push({ label: "En oferta", href: basePath + buildCatalogSearch(query, { soloOfertas: false }) });
  }
  if (query.envioGratis) {
    chips.push({ label: "Envío gratis", href: basePath + buildCatalogSearch(query, { envioGratis: false }) });
  }
  if (chips.length === 0) return null;

  const sinFiltros = buildCatalogSearch(query, {
    marcas: [],
    precioMin: undefined,
    precioMax: undefined,
    ratingMin: undefined,
    soloOfertas: false,
    envioGratis: false,
  });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          aria-label={`Quitar filtro ${chip.label}`}
          className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-slate-900"
        >
          {chip.label}
          <X className="h-3.5 w-3.5" />
        </Link>
      ))}
      <Link
        href={`${basePath}${sinFiltros}`}
        className="text-sm font-medium text-brand hover:underline"
      >
        Limpiar todo
      </Link>
    </div>
  );
}
