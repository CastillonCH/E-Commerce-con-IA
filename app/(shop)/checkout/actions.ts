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
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        nombre: z.string().min(1),
        imagen_url: z.string().min(1),
        precio: z.number().positive(),
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
  const total = items.reduce(
    (sum, item) => sum + item.precio * item.cantidad,
    0,
  );

  const order = await createOrder({
    clienteNombre: direccion.nombre,
    clienteEmail: session.email,
    direccion,
    metodoPago,
    items,
    total,
  });

  return { success: true, orderId: order.id };
}
