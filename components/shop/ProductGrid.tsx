import { MOCK_PRODUCTS } from "@/lib/mock-products";
import { ProductCard } from "@/components/shop/ProductCard";

interface ProductGridProps {
  q?: string;
  categoria?: string;
  soloNuevos?: boolean;
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
export async function ProductGrid({ q, categoria, soloNuevos }: ProductGridProps) {
  const products = MOCK_PRODUCTS.filter((product) => {
    const matchesQuery = q
      ? product.nombre.toLowerCase().includes(q.toLowerCase()) ||
        product.marca.toLowerCase().includes(q.toLowerCase())
      : true;
    const matchesCategoria = categoria
      ? product.departamento === categoria
      : true;
    const matchesNuevo = soloNuevos ? Boolean(product.esNuevo) : true;
    return matchesQuery && matchesCategoria && matchesNuevo;
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
      {products.map((product, index) => (
        // Animación puramente CSS (sin IntersectionObserver): siempre termina
        // en opacity 1 aunque el JS falle o tarde, a diferencia de una
        // animación "reveal" dependiente de JS — el catálogo es contenido
        // comercial principal y no puede arriesgarse a quedar invisible.
        <div
          key={product.id}
          style={{ animationDelay: `${(index % 4) * 70}ms` }}
          className="animate-[fade-up_0.4s_ease-out_backwards]"
        >
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
