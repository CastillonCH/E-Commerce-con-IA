export const APP_CONFIG = {
  storeName: "NovaStore",
  currency: "PEN",
  locale: "es-PE",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  productsPerPage: 12,
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "51999999999",
  freeShippingThreshold: 199,
} as const;
