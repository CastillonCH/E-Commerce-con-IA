import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { MOCK_PRODUCTS } from "@/lib/mock-products";
import { formatCurrency } from "@/lib/utils";

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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Marca</th>
              <th className="px-4 py-3 font-medium">Departamento</th>
              <th className="px-4 py-3 font-medium">Categoría IA</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Stock</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_PRODUCTS.map((product) => (
              <tr key={product.id} className="border-b border-slate-100 text-slate-700 last:border-0">
                <td className="px-4 py-3">{product.nombre}</td>
                <td className="px-4 py-3">{product.marca}</td>
                <td className="px-4 py-3">{product.departamento}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {product.categoria_ia}
                  </span>
                </td>
                <td className="px-4 py-3">{formatCurrency(product.precio)}</td>
                <td className="px-4 py-3">{product.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
