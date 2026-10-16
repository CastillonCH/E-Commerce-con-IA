import { afterAll, describe, expect, it } from "vitest";
import { closePool } from "@/lib/db";
import { createOrder, listOrders, listOrdersByEmail, updateOrderStatus } from "@/lib/data/orders-repo";

function baseInput(email: string, productId = "1", cantidad = 1) {
  return {
    clienteEmail: email,
    direccion: {
      nombre: "Cliente de Prueba",
      direccion: "Av. Siempre Viva 123",
      ciudad: "Lima",
      telefono: "987654321",
    },
    metodoPago: "tarjeta" as const,
    items: [{ productId, cantidad }],
  };
}

describe.skipIf(!process.env.DATABASE_URL)(
  "orders-repo (integración con PostgreSQL)",
  () => {
    afterAll(async () => {
      await closePool();
    });

    it("crea un pedido con estado 'pendiente' tomando el precio real de la base, no el del cliente", async () => {
      const beforeLength = (await listOrders()).length;
      const order = await createOrder(baseInput("maria.fernandez@gmail.com"));

      expect(order.estado).toBe("pendiente");
      expect(order.id).toMatch(/^PED-/);
      // Producto 1 = Audífonos Inalámbricos Pro, precio real 289.90.
      expect(order.items[0].precio).toBe(289.9);

      const after = await listOrders();
      expect(after.length).toBe(beforeLength + 1);
      expect(after[0].id).toBe(order.id);
    });

    it("listOrdersByEmail filtra sin distinguir mayúsculas/minúsculas y no devuelve pedidos de otro cliente", async () => {
      const order = await createOrder(baseInput("jorge.salazar@gmail.com"));

      const found = await listOrdersByEmail("JORGE.SALAZAR@gmail.com");
      expect(found.some((o) => o.id === order.id)).toBe(true);

      const none = await listOrdersByEmail("nadie-tiene-este-correo@example.com");
      expect(none).toEqual([]);
    });

    it("actualiza el estado de un pedido existente", async () => {
      const order = await createOrder(baseInput("lucia.torres@hotmail.com"));
      const updated = await updateOrderStatus(order.id, "en_camino");
      expect(updated?.estado).toBe("en_camino");
    });

    it("devuelve null para un pedido que no existe", async () => {
      expect(await updateOrderStatus("PED-00000000", "entregado")).toBeNull();
    });

    it("rechaza pedir más stock del disponible", async () => {
      await expect(
        createOrder(baseInput("diego.huaman@gmail.com", "13", 999)),
      ).rejects.toThrow(/Stock insuficiente/);
    });

    it("lanza al intentar reabrir un pedido ya entregado", async () => {
      const order = await createOrder(baseInput("valeria.rojas@outlook.com"));
      await updateOrderStatus(order.id, "entregado");
      await expect(updateOrderStatus(order.id, "pendiente")).rejects.toThrow(/ya está/);
    });
  },
);
