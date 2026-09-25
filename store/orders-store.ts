import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Order, OrderStatus } from "@/types";

interface OrdersState {
  orders: Order[];
  addOrder: (order: Order) => void;
  updateStatus: (orderId: string, estado: OrderStatus) => void;
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set) => ({
      orders: [],
      addOrder: (order) =>
        set((state) => ({ orders: [order, ...state.orders] })),
      updateStatus: (orderId, estado) =>
        set((state) => ({
          orders: state.orders.map((order) =>
            order.id === orderId ? { ...order, estado } : order,
          ),
        })),
    }),
    { name: "orders-storage" },
  ),
);
