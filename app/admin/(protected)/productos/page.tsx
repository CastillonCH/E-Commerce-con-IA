import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { countProductsByEstado, listAdminProducts } from "@/lib/data/products-repo";
import { ESTADOS_PRODUCTO, esEstadoProducto } from "@/lib/catalogo";
import { ProductsTable } from "@/components/admin/ProductsTable";
import { cn } from "@/lib/utils";

interface AdminProductsPageProps {
  searchParams: Promise<{ estado?: string }>;
}

// El personal ve TODO el catálogo, en pestañas por estado: lo publicado,
// lo que espera revisión, lo rechazado (con su motivo), lo pausado y lo
// archivado. Antes solo se veía lo publicado y el resto quedaba invisible.
export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  const { estado: estadoParam } = await searchParams;
  const estado = esEstadoProducto(estadoParam) ? estadoParam : "publicado";

  const [session, products, conteo] = await Promise.all([
    getSession(),
    listAdminProducts(estado),
    countProductsByEstado(),
  ]);
  const esAdmin = session?.role === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Productos</h1>
        <Link
          href="/admin/productos/nuevo"
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <PackagePlus className="h-4 w-4" />
          Nuevo producto
        </Link>
      </div>

      <nav aria-label="Estados del producto" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {ESTADOS_PRODUCTO.map(({ estado: valor, etiqueta }) => {
          const activo = valor === estado;
          return (
            <Link
              key={valor}
              href={`/admin/productos?estado=${valor}`}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                activo
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {etiqueta}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  activo ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {conteo[valor]}
              </span>
            </Link>
          );
        })}
      </nav>

      <ProductsTable key={estado} estado={estado} products={products} esAdmin={esAdmin} />
    </div>
  );
}
