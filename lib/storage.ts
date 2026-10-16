import "server-only";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { APP_CONFIG } from "./config";

// Antes esto lo hacía el servicio de IA (ver la Fase 7 del refactor
// anterior); ahora que la IA es un microservicio Python aparte que solo
// clasifica, guardar la foto es trabajo de Next — ver docs/ARQUITECTURA_IA.md.
const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

export class ImagenInvalidaError extends Error {}

export async function guardarImagenProducto(archivo: File): Promise<string> {
  const extension = TIPOS_PERMITIDOS[archivo.type];
  if (!extension) {
    throw new ImagenInvalidaError(
      `Tipo de imagen no soportado (${archivo.type || "desconocido"}). Usa PNG, JPG o WEBP.`,
    );
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    throw new ImagenInvalidaError("La imagen no puede superar los 5 MB.");
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const nombreArchivo = `${randomUUID()}.${extension}`;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    return subirAAzureBlob(connectionString, nombreArchivo, buffer, archivo.type);
  }

  // Desarrollo local: public/uploads/ queda fuera de git (ver .gitignore)
  // — nunca usar esto en producción, el disco de un contenedor no es
  // persistente ni se comparte entre réplicas.
  const carpeta = path.join(process.cwd(), "public", "uploads", "productos");
  await mkdir(carpeta, { recursive: true });
  await writeFile(path.join(carpeta, nombreArchivo), buffer);
  // producto_imagenes.url exige una URL absoluta (ver migración 001) — una
  // ruta relativa como "/uploads/..." nunca la cumple, con o sin https.
  return `${APP_CONFIG.siteUrl}/uploads/productos/${nombreArchivo}`;
}

async function subirAAzureBlob(
  connectionString: string,
  nombreArchivo: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const { BlobServiceClient } = await import("@azure/storage-blob");
  const cliente = BlobServiceClient.fromConnectionString(connectionString);
  const contenedor = cliente.getContainerClient("productos");
  await contenedor.createIfNotExists({ access: "blob" });
  const blob = contenedor.getBlockBlobClient(nombreArchivo);
  await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
  return blob.url;
}
