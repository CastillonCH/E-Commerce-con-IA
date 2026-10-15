"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { updateOrderStatus } from "@/lib/data/orders-repo";

const schema = z.object({
  orderId: z.string().min(1),
  estado: z.enum(["pendiente", "en_camino", "entregado", "cancelado"]),
});

export interface UpdateOrderStatusResult {
  success: boolean;
  error?: string;
}

export async function updateOrderStatusAction(
  input: unknown,
): Promise<UpdateOrderStatusResult> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "No autorizado." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos inválidos." };
  }

  const order = await updateOrderStatus(parsed.data.orderId, parsed.data.estado);
  if (!order) {
    return { success: false, error: "Pedido no encontrado." };
  }

  return { success: true };
}
