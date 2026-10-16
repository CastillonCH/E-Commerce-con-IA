"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createOrder } from "@/lib/data/orders-repo";

const placeOrderSchema = z.object({
  direccion: z.object({
    nombre: z.string().trim().min(1),
    direccion: z.string().trim().min(1),
    ciudad: z.string().trim().min(1),
    telefono: z.string().trim().min(1),
  }),
  metodoPago: z.enum(["tarjeta", "yape_plin", "contraentrega"]),
  // Solo productId + cantidad: el precio y el nombre los toma la base de
  // datos directo de `productos`, nunca de lo que mande el cliente (ver
  // lib/data/orders-repo.ts).
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        cantidad: z.number().int().positive(),
      }),
    )
    .min(1),
});

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

export async function placeOrder(input: unknown): Promise<PlaceOrderResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, error: "Debes iniciar sesión para continuar." };
  }

  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos de pedido inválidos." };
  }

  const { direccion, metodoPago, items } = parsed.data;

  try {
    const order = await createOrder({
      clienteEmail: session.email,
      direccion,
      metodoPago,
      items,
    });
    return { success: true, orderId: order.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo crear el pedido.";
    return { success: false, error: message };
  }
}
