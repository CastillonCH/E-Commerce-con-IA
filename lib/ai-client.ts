import "server-only";
import { z } from "zod";
import { getServerEnv } from "@/lib/env.server";

const TopKSchema = z.object({
  indice_clase: z.number(),
  categoria: z.string(),
  prob: z.number(),
});

const ResultadoSchema = z.object({
  indice_clase: z.number(),
  categoria: z.string(),
  confianza: z.number(),
  top_k: z.array(TopKSchema),
});

const PorModeloSchema = z.object({
  codigo_modelo: z.string(),
  tipo: z.enum(["imagen", "texto"]),
  indice_clase: z.number(),
  categoria: z.string(),
  confianza: z.number(),
  top_k: z.array(TopKSchema),
});

const EmbeddingSchema = z.object({
  codigo_modelo: z.string(),
  fuente: z.enum(["imagen", "texto"]),
  vector: z.array(z.number()),
});

// Mismo contrato que ai-service/app/esquemas.py::ClasificarResponse —
// validado con Zod porque viene de un servicio externo (aunque sea "el
// nuestro"), nunca se confía en la forma de un JSON ajeno sin verificar.
const ClasificarResponseSchema = z.object({
  modo: z.enum(["real", "demo"]),
  latencia_ms: z.number(),
  resultado: ResultadoSchema,
  por_modelo: z.array(PorModeloSchema),
  embeddings: z.array(EmbeddingSchema),
});

export type ClasificarResponse = z.infer<typeof ClasificarResponseSchema>;

const TIMEOUT_MS = 20_000;

export class AIServiceNoConfiguradoError extends Error {}
export class AIServiceError extends Error {}

export interface ClasificarProductoInput {
  titulo: string;
  descripcion: string;
  imagen: File;
}

/**
 * Llama a POST /clasificar de ai-service. Lanza (no devuelve null) si
 * algo falla — el llamador (Server Action de alta de producto) decide
 * cómo degradar: "nunca bloquees al vendedor" significa que el producto
 * se guarda igual, sin predicción, con un aviso — ver
 * app/admin/(protected)/productos/actions.ts.
 */
export async function clasificarProducto(
  input: ClasificarProductoInput,
): Promise<ClasificarResponse> {
  const env = getServerEnv();
  if (!env.AI_SERVICE_URL) {
    throw new AIServiceNoConfiguradoError(
      "AI_SERVICE_URL no está configurado (ver .env.example). El módulo de IA no está disponible.",
    );
  }

  const formData = new FormData();
  formData.append("titulo", input.titulo);
  formData.append("descripcion", input.descripcion);
  formData.append("imagen", input.imagen);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${env.AI_SERVICE_URL}/clasificar`, {
      method: "POST",
      headers: env.AI_API_KEY ? { "X-API-Key": env.AI_API_KEY } : undefined,
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AIServiceError(
        `El servicio de IA no respondió en ${TIMEOUT_MS / 1000}s.`,
      );
    }
    throw new AIServiceError(
      `No se pudo conectar con el servicio de IA (${env.AI_SERVICE_URL}). ¿Está corriendo?`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new AIServiceError(
      `El servicio de IA respondió ${respuesta.status}${detalle ? `: ${detalle}` : ""}.`,
    );
  }

  const json = await respuesta.json();
  const parsed = ClasificarResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new AIServiceError(
      "La respuesta del servicio de IA no tiene el formato esperado.",
    );
  }
  return parsed.data;
}

const HealthSchema = z.object({
  estado: z.string(),
  modo: z.enum(["real", "demo"]),
  modelos_cargados: z.array(z.string()),
});

export interface AIServiceHealth {
  estado: string;
  modo: "real" | "demo";
  modelosCargados: string[];
}

/** Usado por /admin/modelos — nunca lanza: si no se puede alcanzar el
 * servicio, devuelve null (la página lo muestra como "fuera de línea"). */
export async function obtenerSaludIA(): Promise<AIServiceHealth | null> {
  const env = getServerEnv();
  if (!env.AI_SERVICE_URL) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const respuesta = await fetch(`${env.AI_SERVICE_URL}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!respuesta.ok) return null;
    const parsed = HealthSchema.safeParse(await respuesta.json());
    if (!parsed.success) return null;
    return {
      estado: parsed.data.estado,
      modo: parsed.data.modo,
      modelosCargados: parsed.data.modelos_cargados,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
