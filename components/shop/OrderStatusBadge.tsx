import type { OrderStatus } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pendiente: "bg-amber-50 text-amber-700",
  en_camino: "bg-blue-50 text-blue-700",
  entregado: "bg-green-50 text-green-700",
  cancelado: "bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function OrderStatusBadge({ estado }: { estado: OrderStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[estado])}>
      {STATUS_LABELS[estado]}
    </span>
  );
}
