import { describe, expect, it } from "vitest";
import {
  createOrder,
  listOrders,
  listOrdersByEmail,
  updateOrderStatus,
} from "@/lib/data/orders-repo";

function baseInput(email: string) {
  return {
    clienteNombre: "Cliente de Prueba",
    clienteEmail: email,
    direccion: {
      nombre: "Cliente de Prueba",
      direccion: "Av. Siempre Viva 123",
      ciudad: "Lima",
      telefono: "987654321",
    },
    metodoPago: "tarjeta" as const,
    items: [
      {
        productId: "1",
        nombre: "Audífonos Inalámbricos Pro",
        imagen_url: "https://example.com/img.jpg",
        precio: 289.9,
        cantidad: 2,
      },
    ],
    total: 579.8,
  };
}

describe("createOrder / listOrders", () => {
  it("crea un pedido con estado 'pendiente' y lo antepone a la lista", async () => {
    const beforeLength = (await listOrders()).length;
    const order = await createOrder(baseInput("nuevo-test@example.com"));

    expect(order.estado).toBe("pendiente");
    expect(order.id).toMatch(/^PED-/);

    const after = await listOrders();
    expect(after.length).toBe(beforeLength + 1);
    expect(after[0].id).toBe(order.id);
  });
});

describe("listOrdersByEmail", () => {
  it("filtra sin distinguir mayúsculas/minúsculas", async () => {
    const email = "filtro-test@example.com";
    await createOrder(baseInput(email));

    const found = await listOrdersByEmail(email.toUpperCase());
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((o) => o.clienteEmail === email)).toBe(true);
  });

  it("no devuelve pedidos de otro cliente", async () => {
    const found = await listOrdersByEmail("nadie-tiene-este-correo@example.com");
    expect(found).toEqual([]);
  });
});

describe("updateOrderStatus", () => {
  it("actualiza el estado de un pedido existente", async () => {
    const order = await createOrder(baseInput("estado-test@example.com"));
    const updated = await updateOrderStatus(order.id, "en_camino");
    expect(updated?.estado).toBe("en_camino");

    const [found] = await listOrdersByEmail("estado-test@example.com");
    expect(found.estado).toBe("en_camino");
  });

  it("devuelve null para un pedido que no existe", async () => {
    expect(await updateOrderStatus("PED-00000000", "entregado")).toBeNull();
  });
});
