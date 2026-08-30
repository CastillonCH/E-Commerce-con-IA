/**
 * Config centralizada. Cambiar moneda/locale aquí afecta a toda la app.
 * Ajustar según el mercado real de la tienda.
 */
export const APP_CONFIG = {
  storeName: "NovaStore",
  currency: "PEN",
  locale: "es-PE",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  productsPerPage: 12,
  /** Número usado por el widget del asistente para el handoff a WhatsApp (formato E.164 sin "+"). */
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "51999999999",
  freeShippingThreshold: 199,
} as const;
