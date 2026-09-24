import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Order, OrderStatus } from "@/types";

interface OrdersState {
  orders: Order[];
  addOrder: (order: Order) => void;
  updateStatus: (orderId: string, estado: OrderStatus) => void;
}

/**
 * "Base de datos" de pedidos simulada en localStorage, compartida por el
 * checkout del cliente (crea pedidos), el historial de pedidos del cliente
 * y el panel de administración (lista y actualiza el estado de todos).
 * Cuando exista `POST/GET /api/pedidos` en el backend, este store pasa a
 * ser solo una caché local y las mutaciones deben ir contra la API.
 */
export const useOrdersStore = create<OrdersState>()(
  persist(
    (set) => ({
      orders: [],
      addOrder: (order) =>
        set((state) => ({ orders: [order, ...state.orders] })),
      updateStatus: (orderId, estado) =>
        set((state) => ({
          orders: state.orders.map((order) =>
            order.id === orderId ? { ...order, estado } : order
          ),
        })),
    }),
    { name: "orders-storage" }
  )
);
