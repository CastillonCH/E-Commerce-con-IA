import { listProducts } from "@/lib/data/products-repo";
import { APP_CONFIG } from "@/lib/config";
import { ProductCard } from "@/components/shop/ProductCard";
import { Pagination } from "@/components/shop/Pagination";

interface ProductGridProps {
  q?: string;
  departamento?: string;
  categoria?: string;
  soloNuevos?: boolean;
  page?: number;
}

export async function ProductGrid({
  q,
  departamento,
  categoria,
  soloNuevos,
  page = 1,
}: ProductGridProps) {
  const allProducts = await listProducts({ q, departamento, categoria, soloNuevos });

  if (allProducts.length === 0) {
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

  const totalPages = Math.ceil(allProducts.length / APP_CONFIG.productsPerPage);
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * APP_CONFIG.productsPerPage;
  const products = allProducts.slice(start, start + APP_CONFIG.productsPerPage);

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (departamento) params.set("departamento", departamento);
    if (categoria) params.set("categoria", categoria);
    if (soloNuevos) params.set("nuevo", "1");
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `/?${query}#catalogo` : "/#catalogo";
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product, index) => (
          <div
            key={product.id}
            style={{ animationDelay: `${(index % 4) * 70}ms` }}
            className="animate-[fade-up_0.4s_ease-out_backwards]"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
      <Pagination page={currentPage} totalPages={totalPages} buildHref={buildHref} />
    </>
  );
}
