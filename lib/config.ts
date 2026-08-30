/**
 * Config centralizada. Cambiar moneda/locale aquí afecta a toda la app.
 * Ajustar según el mercado real de la tienda.
 */
export const APP_CONFIG = {
  storeName: "TiendaIA",
  currency: "USD",
  locale: "es-MX",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  productsPerPage: 12,
} as const;
