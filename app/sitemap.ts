import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/lib/config";
import { listProducts } from "@/lib/data/products-repo";

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
