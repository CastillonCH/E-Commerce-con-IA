import { listOrders } from "@/lib/data/orders-repo";
import { AdminOrdersTable } from "@/components/admin/AdminOrdersTable";

export default async function AdminOrdersPage() {
  const orders = await listOrders();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pedidos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todos los pedidos generados por los clientes y su estado de entrega.
        </p>
      </div>

      <AdminOrdersTable orders={orders} />
    </div>
  );
}
