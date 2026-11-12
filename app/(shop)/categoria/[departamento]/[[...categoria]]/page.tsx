import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listProducts } from "@/lib/data/products-repo";
import {
  CATEGORIAS_IA,
  catalogoHref,
  categoriaFromSlug,
  departamentoFromSlug,
  type Departamento,
} from "@/lib/taxonomy";
import { parseCatalogQuery, type SearchParamsRecord } from "@/lib/catalog-filters";
import { APP_CONFIG } from "@/lib/config";
import { CatalogView } from "@/components/shop/catalog/CatalogView";

interface CategoriaPageProps {
  params: Promise<{ departamento: string; categoria?: string[] }>;
  searchParams: Promise<SearchParamsRecord>;
}

// /categoria/electronica → todo el departamento
// /categoria/electronica/audio-y-audifonos → una categoría
// Cualquier otro slug (o un tercer segmento) es 404.
function resolverRuta(
  departamentoSlug: string,
  categoriaSlug: string[] | undefined,
): { departamento: Departamento; categoria: string | null } {
  const departamento = departamentoFromSlug(departamentoSlug);
  if (!departamento || (categoriaSlug && categoriaSlug.length > 1)) notFound();
  if (!categoriaSlug) return { departamento, categoria: null };
  const categoria = categoriaFromSlug(departamento, categoriaSlug[0]);
  if (!categoria) notFound();
  return { departamento, categoria };
}

export async function generateMetadata({ params }: CategoriaPageProps): Promise<Metadata> {
  const { departamento: depSlug, categoria: catSlug } = await params;
  const departamento = departamentoFromSlug(depSlug);
  if (!departamento) return {};
  const categoria = catSlug?.length === 1 ? categoriaFromSlug(departamento, catSlug[0]) : null;
  const titulo = categoria ?? departamento;
  return {
    title: titulo,
    description: `Compra ${titulo.toLowerCase()} en ${APP_CONFIG.storeName}: las mejores marcas, ofertas y envío a todo el Perú.`,
    alternates: { canonical: catalogoHref(departamento, categoria ?? undefined) },
  };
}

export default async function CategoriaPage({ params, searchParams }: CategoriaPageProps) {
  const { departamento: depSlug, categoria: catSlug } = await params;
  const { departamento, categoria } = resolverRuta(depSlug, catSlug);
  const query = parseCatalogQuery(await searchParams);

  const delDepartamento = await listProducts({ departamento });
  const enAlcance = categoria
    ? delDepartamento.filter((p) => p.categoria_ia === categoria)
    : delDepartamento;

  return (
    <CatalogView
      titulo={categoria ?? departamento}
      subtitulo={categoria ? departamento : "Departamento"}
      migas={[
        { label: "Inicio", href: "/" },
        { label: "Todos los productos", href: "/productos" },
        categoria ? { label: departamento, href: catalogoHref(departamento) } : { label: departamento },
        ...(categoria ? [{ label: categoria }] : []),
      ]}
      enAlcance={enAlcance}
      query={query}
      basePath={catalogoHref(departamento, categoria ?? undefined)}
      alcance={{
        titulo: "Categoría",
        enlaces: CATEGORIAS_IA[departamento].map((c) => ({
          label: c,
          href: catalogoHref(departamento, c),
          activo: categoria === c,
        })),
      }}
      vacio={{
        titulo: "Aún no hay productos en esta categoría",
        detalle: "Vuelve pronto o explora otra categoría.",
      }}
    />
  );
}
