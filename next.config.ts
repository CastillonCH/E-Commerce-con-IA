import type { NextConfig } from "next";

const azureBlobHostname = process.env.AZURE_BLOB_HOSTNAME;
const isDev = process.env.NODE_ENV !== "production";

// Solo en desarrollo: sin Azure Blob, lib/storage.ts guarda las fotos en
// public/uploads/ con URL absoluta http://localhost:..., y los datos de
// prueba usan https://example.com. En producción el optimizador de
// imágenes NO debe poder leer IPs locales (riesgo de SSRF, ver
// images.dangerouslyAllowLocalIP en la documentación de Next 16).
const imagenesSoloDev = isDev
  ? [
      { protocol: "http" as const, hostname: "localhost" },
      { protocol: "http" as const, hostname: "127.0.0.1" },
      { protocol: "https" as const, hostname: "example.com" },
    ]
  : [];
const imgSrcSoloDev = isDev ? " http://localhost:* http://127.0.0.1:* https://example.com" : "";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://images.unsplash.com https://lh3.googleusercontent.com${imgSrcSoloDev}${azureBlobHostname ? ` https://${azureBlobHostname}` : ""}`,
  "font-src 'self' data:",
  "connect-src 'self' https://oauth2.googleapis.com https://www.googleapis.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowLocalIP: isDev,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      ...imagenesSoloDev,
      ...(azureBlobHostname
        ? [{ protocol: "https" as const, hostname: azureBlobHostname }]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
