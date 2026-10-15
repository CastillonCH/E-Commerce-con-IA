import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/perfil", "/checkout", "/carrito"],
    },
    sitemap: `${APP_CONFIG.siteUrl}/sitemap.xml`,
  };
}
