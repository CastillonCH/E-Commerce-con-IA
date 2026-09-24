import { AdminOrdersTable } from "@/components/admin/AdminOrdersTable";

export default function AdminOrdersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pedidos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todos los pedidos generados por los clientes y su estado de entrega.
        </p>
      </div>

      <AdminOrdersTable />
    </div>
  );
}
