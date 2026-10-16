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

  try {
    const order = await updateOrderStatus(parsed.data.orderId, parsed.data.estado);
    if (!order) {
      return { success: false, error: "Pedido no encontrado." };
    }
    return { success: true };
  } catch (error) {
    // trg_pedidos_cambio_estado bloquea reabrir un pedido entregado/cancelado
    // con un mensaje ya en español, listo para mostrar.
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar el pedido.";
    return { success: false, error: message };
  }
}
