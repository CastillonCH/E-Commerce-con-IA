"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageSearch } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types";
import { OrderStatusBadge } from "@/components/shop/OrderStatusBadge";
import { updateOrderStatusAction } from "@/app/admin/(protected)/pedidos/actions";

const STATUS_OPTIONS: OrderStatus[] = [
  "pendiente",
  "en_camino",
  "entregado",
  "cancelado",
];

export function AdminOrdersTable({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function handleStatusChange(orderId: string, estado: OrderStatus) {
    setUpdatingId(orderId);
    const result = await updateOrderStatusAction({ orderId, estado });
    setUpdatingId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo actualizar el pedido.");
      return;
    }
    router.refresh();
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <PackageSearch className="h-8 w-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-900">
          Todavía no hay pedidos
        </p>
        <p className="text-xs text-slate-500">
          Los pedidos que los clientes generen desde el checkout aparecerán
          aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">Lista de pedidos de clientes</caption>
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th scope="col" className="px-4 py-3 font-medium">Pedido</th>
            <th scope="col" className="px-4 py-3 font-medium">Cliente</th>
            <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
            <th scope="col" className="px-4 py-3 font-medium">Total</th>
            <th scope="col" className="px-4 py-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              className="border-b border-slate-100 text-slate-700 last:border-0"
            >
              <td className="px-4 py-3 font-medium text-slate-900">
                {order.id}
              </td>
              <td className="px-4 py-3">
                <p>{order.clienteNombre}</p>
                <p className="text-xs text-slate-500">{order.clienteEmail}</p>
              </td>
              <td className="px-4 py-3">
                {new Date(order.fecha).toLocaleDateString("es-PE", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </td>
              <td className="px-4 py-3">{formatCurrency(order.total)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <OrderStatusBadge estado={order.estado} />
                  <select
                    value={order.estado}
                    disabled={updatingId === order.id}
                    onChange={(event) =>
                      handleStatusChange(
                        order.id,
                        event.target.value as OrderStatus,
                      )
                    }
                    aria-label={`Cambiar estado del pedido ${order.id}`}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-slate-900 disabled:opacity-50"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
