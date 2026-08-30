import { MOCK_PRODUCTS } from "@/lib/mock-products";
import { ProductCard } from "@/components/shop/ProductCard";

interface ProductGridProps {
  q?: string;
  categoria?: string;
}

/**
 * Server Component: el catálogo se resuelve en el servidor (mejor SEO y
 * carga inicial que un useEffect + axios en cliente). Hoy usa datos
 * simulados; cuando exista el backend, esta es la única línea a cambiar:
 *
 *   const products = await fetchProducts();
 *
 * (fetchProducts ya está implementado en lib/api.ts, apuntando a
 * GET /api/productos vía el cliente axios centralizado).
 */
export async function ProductGrid({ q, categoria }: ProductGridProps) {
  const products = MOCK_PRODUCTS.filter((product) => {
    const matchesQuery = q
      ? product.nombre.toLowerCase().includes(q.toLowerCase()) ||
        product.marca.toLowerCase().includes(q.toLowerCase())
      : true;
    const matchesCategoria = categoria
      ? product.departamento === categoria
      : true;
    return matchesQuery && matchesCategoria;
  });

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-24 text-center">
        <p className="text-lg font-medium text-slate-900">
          No encontramos productos
        </p>
        <p className="text-sm text-slate-500">
          Intenta con otra búsqueda o categoría.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
