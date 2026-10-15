import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, Product } from "@/types";

interface CartState {
  items: CartItem[];
  addItem: (product: Product, cantidad?: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  totalItems: () => number;
  totalPrice: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, cantidad = 1) =>
        set((state) => {
          const existing = state.items.find(
            (item) => item.product.id === product.id,
          );
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.product.id === product.id
                  ? { ...item, cantidad: item.cantidad + cantidad }
                  : item,
              ),
            };
          }
          return { items: [...state.items, { product, cantidad }] };
        }),
      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.product.id !== productId),
        })),
      clear: () => set({ items: [] }),
      totalItems: () =>
        get().items.reduce((sum, item) => sum + item.cantidad, 0),
      totalPrice: () =>
        get().items.reduce(
          (sum, item) => sum + item.product.precio * item.cantidad,
          0,
        ),
    }),
    { name: "cart-storage" },
  ),
);
