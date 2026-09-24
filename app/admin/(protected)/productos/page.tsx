import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { MOCK_PRODUCTS } from "@/lib/mock-products";
import { ProductsTable } from "@/components/admin/ProductsTable";

export default function AdminProductsPage() {
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

      <ProductsTable products={MOCK_PRODUCTS} />
    </div>
  );
}
