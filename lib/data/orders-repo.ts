import "server-only";
import type { Order, OrderStatus, OrderItem, PaymentMethod, ShippingAddress } from "@/types";

// Estado en memoria compartido por todo el servidor (a diferencia del
// antiguo store de Zustand con `persist`, que guardaba los pedidos en el
// localStorage del navegador de cada cliente: el panel de administración
// nunca veía los pedidos reales porque vivían en un almacenamiento distinto
// al suyo). Placeholder hasta que el backend real tenga una tabla `orders`.
const orders: Order[] = [];

export interface CreateOrderInput {
  clienteNombre: string;
  clienteEmail: string;
  direccion: ShippingAddress;
  metodoPago: PaymentMethod;
  items: OrderItem[];
  total: number;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const order: Order = {
    id: `PED-${Date.now().toString().slice(-8)}`,
    fecha: new Date().toISOString(),
    estado: "pendiente",
    ...input,
  };
  orders.unshift(order);
  return order;
}

export async function listOrders(): Promise<Order[]> {
  return orders;
}

export async function listOrdersByEmail(email: string): Promise<Order[]> {
  const normalized = email.trim().toLowerCase();
  return orders.filter((order) => order.clienteEmail.toLowerCase() === normalized);
}

export async function updateOrderStatus(
  orderId: string,
  estado: OrderStatus,
): Promise<Order | null> {
  const index = orders.findIndex((order) => order.id === orderId);
  if (index === -1) return null;
  orders[index] = { ...orders[index], estado };
  return orders[index];
}
