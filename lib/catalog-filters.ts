import type { Product } from "@/types";
import { discountPercent } from "@/lib/utils";

// Filtros y orden de las páginas de categoría (/categoria/...). Todo vive
// en la URL (?marca=X&min=50&orden=precio-asc...) para que se pueda
// compartir el enlace, usar el botón "atrás" y que el servidor renderice
// el resultado sin JavaScript. Funciones puras: se usan tanto en el
// Server Component de la página como en los filtros del cliente.

export const ORDENES = [
  { value: "recomendados", label: "Recomendados" },
  { value: "precio-asc", label: "Precio: menor a mayor" },
  { value: "precio-desc", label: "Precio: mayor a menor" },
  { value: "valorados", label: "Mejor valorados" },
  { value: "descuento", label: "Mayor descuento" },
  { value: "nuevos", label: "Novedades" },
] as const;

export type Orden = (typeof ORDENES)[number]["value"];

export const RATINGS_MINIMOS = [4, 3, 2, 1] as const;

export interface CatalogQuery {
  marcas: string[];
  precioMin?: number;
  precioMax?: number;
  ratingMin?: number;
  soloOfertas: boolean;
  envioGratis: boolean;
  orden: Orden;
  page: number;
}

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

function lista(valor: string | string[] | undefined): string[] {
  if (valor === undefined) return [];
  return (Array.isArray(valor) ? valor : [valor]).filter(Boolean);
}

function primero(valor: string | string[] | undefined): string | undefined {
  return lista(valor)[0];
}

function numeroPositivo(valor: string | undefined): number | undefined {
  if (!valor) return undefined;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function parseCatalogQuery(params: SearchParamsRecord): CatalogQuery {
  const orden = primero(params.orden);
  const rating = numeroPositivo(primero(params.rating));

  return {
    marcas: [...new Set(lista(params.marca))],
    precioMin: numeroPositivo(primero(params.min)),
    precioMax: numeroPositivo(primero(params.max)),
    ratingMin:
      rating !== undefined && (RATINGS_MINIMOS as readonly number[]).includes(rating)
        ? rating
        : undefined,
    soloOfertas: primero(params.ofertas) === "1",
    envioGratis: primero(params.envio) === "1",
    orden: ORDENES.some((o) => o.value === orden) ? (orden as Orden) : "recomendados",
    page: Math.max(1, Math.floor(Number(primero(params.page))) || 1),
  };
}

// Serializa la consulta de vuelta a "?..." — omite los valores por
// defecto para que las URLs queden limpias. Cualquier cambio de filtro
// vuelve a la página 1 (salvo que se pida una página explícitamente).
export function buildCatalogSearch(
  query: CatalogQuery,
  cambios: Partial<CatalogQuery> = {},
): string {
  const q = { ...query, page: 1, ...cambios };
  const params = new URLSearchParams();
  for (const marca of q.marcas) params.append("marca", marca);
  if (q.precioMin !== undefined) params.set("min", String(q.precioMin));
  if (q.precioMax !== undefined) params.set("max", String(q.precioMax));
  if (q.ratingMin !== undefined) params.set("rating", String(q.ratingMin));
  if (q.soloOfertas) params.set("ofertas", "1");
  if (q.envioGratis) params.set("envio", "1");
  if (q.orden !== "recomendados") params.set("orden", q.orden);
  if (q.page > 1) params.set("page", String(q.page));
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function hasActiveFilters(query: CatalogQuery): boolean {
  return (
    query.marcas.length > 0 ||
    query.precioMin !== undefined ||
    query.precioMax !== undefined ||
    query.ratingMin !== undefined ||
    query.soloOfertas ||
    query.envioGratis
  );
}

export function applyCatalogQuery(products: Product[], query: CatalogQuery): Product[] {
  const marcas = new Set(query.marcas.map((m) => m.toLowerCase()));

  const filtrados = products.filter((p) => {
    if (marcas.size > 0 && !marcas.has(p.marca.toLowerCase())) return false;
    if (query.precioMin !== undefined && p.precio < query.precioMin) return false;
    if (query.precioMax !== undefined && p.precio > query.precioMax) return false;
    if (query.ratingMin !== undefined && (p.rating ?? 0) < query.ratingMin) return false;
    if (query.soloOfertas && !discountPercent(p.precio, p.precioOriginal)) return false;
    if (query.envioGratis && !p.envioGratis) return false;
    return true;
  });

  const ordenados = [...filtrados];
  switch (query.orden) {
    case "precio-asc":
      ordenados.sort((a, b) => a.precio - b.precio);
      break;
    case "precio-desc":
      ordenados.sort((a, b) => b.precio - a.precio);
      break;
    case "valorados":
      ordenados.sort(
        (a, b) =>
          (b.rating ?? 0) - (a.rating ?? 0) || (b.numResenas ?? 0) - (a.numResenas ?? 0),
      );
      break;
    case "descuento":
      ordenados.sort(
        (a, b) =>
          (discountPercent(b.precio, b.precioOriginal) ?? 0) -
          (discountPercent(a.precio, a.precioOriginal) ?? 0),
      );
      break;
    case "nuevos":
      // Los ids son bigint crecientes: el más alto es el más reciente.
      ordenados.sort(
        (a, b) => Number(Boolean(b.esNuevo)) - Number(Boolean(a.esNuevo)) || Number(b.id) - Number(a.id),
      );
      break;
    case "recomendados":
      break;
  }
  return ordenados;
}

export interface MarcaFacet {
  marca: string;
  cantidad: number;
}

// Las marcas se cuentan sobre TODO el departamento/categoría (no sobre el
// resultado ya filtrado): así marcar una marca no hace desaparecer las
// demás de la lista y se pueden combinar varias.
export function marcaFacets(products: Product[]): MarcaFacet[] {
  const conteo = new Map<string, number>();
  for (const p of products) conteo.set(p.marca, (conteo.get(p.marca) ?? 0) + 1);
  return [...conteo]
    .map(([marca, cantidad]) => ({ marca, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.marca.localeCompare(b.marca, "es"));
}

export function paginate<T>(items: T[], page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * perPage;
  return { items: items.slice(start, start + perPage), currentPage, totalPages };
}
