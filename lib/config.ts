import { clientEnv } from "@/lib/env.client";

export const APP_CONFIG = {
  storeName: "NovaStore",
  currency: "PEN",
  locale: "es-PE",
  apiUrl: clientEnv.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  siteUrl: clientEnv.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  productsPerPage: 12,
  whatsappNumber: clientEnv.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "51999999999",
  freeShippingThreshold: 199,
} as const;
