import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/lib/config";
import { listProducts } from "@/lib/data/products-repo";

// Dinámico a propósito: de lo contrario Next intenta generar este archivo
// en build time, y entonces `npm run build` necesitaría DATABASE_URL
// disponible ahí (no solo en runtime) — un acoplamiento sorpresa para
// cualquier pipeline de build que no tenga acceso a la base.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listProducts();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: APP_CONFIG.siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${APP_CONFIG.siteUrl}/ayuda`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${APP_CONFIG.siteUrl}/productos/${product.id}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...productRoutes];
}
