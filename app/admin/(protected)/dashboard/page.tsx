import Link from "next/link";
import { Package, PackagePlus, TrendingUp, Users, Store } from "lucide-react";
import { listProducts } from "@/lib/data/products-repo";
import { listOrders } from "@/lib/data/orders-repo";
import { listSellers } from "@/lib/data/users-repo";
import { formatCurrency } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const [products, orders, sellers] = await Promise.all([
    listProducts(),
    listOrders(),
    listSellers(),
  ]);

  const stats = [
    { label: "Productos activos", value: products.length, icon: Package },
    {
      label: "Stock total",
      value: products.reduce((sum, p) => sum + p.stock, 0),
      icon: TrendingUp,
    },
    { label: "Vendedores activos", value: sellers.length, icon: Store },
    {
      label: "Ventas totales",
      value: formatCurrency(orders.reduce((sum, o) => sum + o.total, 0)),
      icon: Users,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/vendedores"
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <Store className="h-4 w-4" />
            Ver vendedores
          </Link>
          <Link
            href="/admin/productos/nuevo"
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black"
          >
            <PackagePlus className="h-4 w-4" />
            Nuevo producto
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="rounded-lg bg-slate-100 p-3">
              <Icon className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-sm text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Últimos productos clasificados por IA
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Producto</th>
                <th className="py-2 pr-4 font-medium">Departamento</th>
                <th className="py-2 pr-4 font-medium">Categoría IA</th>
                <th className="py-2 font-medium">Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 5).map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-slate-100 text-slate-700"
                >
                  <td className="py-2 pr-4">{product.nombre}</td>
                  <td className="py-2 pr-4">{product.departamento}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                      {product.categoria_ia}
                    </span>
                  </td>
                  <td className="py-2">{product.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
