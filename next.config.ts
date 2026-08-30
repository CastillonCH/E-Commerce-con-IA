import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Datos simulados mientras no existe el backend.
      { protocol: "https", hostname: "images.unsplash.com" },
      // TODO(backend): reemplazar por el hostname real del bucket S3, p.ej.
      // { protocol: "https", hostname: "<bucket>.s3.amazonaws.com" },
    ],
  },
};

export default nextConfig;
