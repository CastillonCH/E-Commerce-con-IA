"use client";

import Image from "next/image";
import { PackageSearch } from "lucide-react";
import { useOrdersStore } from "@/store/orders-store";
import { useHasMounted } from "@/hooks/useHasMounted";
import { formatCurrency } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/shop/OrderStatusBadge";

export function OrderHistoryList({ email }: { email: string }) {
  const mounted = useHasMounted();
  const orders = useOrdersStore((state) => state.orders).filter(
    (order) => order.clienteEmail === email
  );

  if (!mounted) return null;

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 py-16 text-center">
        <PackageSearch className="h-8 w-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-900">Aún no tienes pedidos</p>
        <p className="text-xs text-slate-500">Cuando compres algo, aparecerá aquí.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {orders.map((order) => (
        <li key={order.id} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">{order.id}</p>
              <p className="text-xs text-slate-500">
                {new Date(order.fecha).toLocaleDateString("es-PE", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <OrderStatusBadge estado={order.estado} />
          </div>

          <ul className="flex flex-col gap-2.5 border-t border-slate-100 pt-3">
            {order.items.map((item) => (
              <li key={item.productId} className="flex items-center gap-3">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  <Image src={item.imagen_url} alt={item.nombre} fill sizes="40px" className="object-cover" />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-slate-700">{item.nombre}</p>
                <p className="shrink-0 text-xs text-slate-500">x{item.cantidad}</p>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              Envío a {order.direccion.direccion}, {order.direccion.ciudad}
            </p>
            <p className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
