import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listProducts, listByMarca } from "@/lib/data/products-repo";
import { ProductsTable } from "@/components/admin/ProductsTable";

export default async function AdminProductsPage() {
  const session = await getSession();
  // Un vendedor solo ve y gestiona los productos de su propia marca; un
  // administrador ve el catálogo completo.
  const products =
    session?.role === "SELLER"
      ? await listByMarca(session.name)
      : await listProducts();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Productos</h1>
        <Link
          href="/admin/productos/nuevo"
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <PackagePlus className="h-4 w-4" />
          Nuevo producto
        </Link>
      </div>

      <ProductsTable products={products} />
    </div>
  );
}
