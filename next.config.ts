import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const azureBlobHostname = process.env.AZURE_BLOB_HOSTNAME;
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  // Next inyecta scripts inline para la hidratación; sin una estrategia de
  // nonce (fuera de alcance de este refactor) 'unsafe-inline' es necesario.
  // 'unsafe-eval' solo en desarrollo: React/Turbopack lo usan para
  // reconstruir stack traces de componentes en `next dev`, nunca en
  // producción (confirmado: sin él, la consola muestra el warning
  // "eval() is not supported..." en cada página durante el dev).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // blob: es necesario para la vista previa local de ImageDropzone
  // (URL.createObjectURL sobre el archivo aún no subido).
  `img-src 'self' data: blob: https://images.unsplash.com https://lh3.googleusercontent.com${azureBlobHostname ? ` https://${azureBlobHostname}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiUrl} https://oauth2.googleapis.com https://www.googleapis.com`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
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
