import type { Metadata } from "next";
import { listProducts } from "@/lib/data/products-repo";
import { DEPARTAMENTOS, catalogoHref } from "@/lib/taxonomy";
import { parseCatalogQuery, type SearchParamsRecord } from "@/lib/catalog-filters";
import { APP_CONFIG } from "@/lib/config";
import { CatalogView } from "@/components/shop/catalog/CatalogView";

export const metadata: Metadata = {
  title: "Todos los productos",
  description: `Todo el catálogo de ${APP_CONFIG.storeName}: filtra por marca, precio y calificación.`,
  alternates: { canonical: "/productos" },
};

// Catálogo completo: a donde lleva "Comprar" del inicio. Mismos filtros y
// orden que las categorías; los departamentos funcionan como accesos.
export default async function TodosLosProductosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  const query = parseCatalogQuery(await searchParams);
  const productos = await listProducts();

  return (
    <CatalogView
      titulo="Todos los productos"
      subtitulo="Catálogo"
      migas={[{ label: "Inicio", href: "/" }, { label: "Todos los productos" }]}
      enAlcance={productos}
      query={query}
      basePath="/productos"
      alcance={{
        titulo: "Departamento",
        enlaces: DEPARTAMENTOS.map((d) => ({ label: d, href: catalogoHref(d), activo: false })),
      }}
      vacio={{ titulo: "Aún no hay productos publicados", detalle: "Vuelve pronto." }}
    />
  );
}
