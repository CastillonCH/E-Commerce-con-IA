import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET debe tener al menos 32 caracteres"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Módulo de IA (ai-service/) — opcionales: si faltan, el alta de
  // producto sigue funcionando (queda en revisión sin predicción, ver
  // lib/ai-client.ts). AI_SERVICE_URL sin AI_API_KEY es válido (el
  // servicio puede correr sin exigir autenticación, ver ai-service/README.md).
  AI_SERVICE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  // "todos": cada ficha pasa por /admin/revision sin importar la
  // confianza (proceso P1 del T1: el analista siempre confirma o
  // corrige). "umbral": publica directo si confianza >= REVIEW_THRESHOLD.
  REVIEW_POLICY: z.enum(["todos", "umbral"]).default("todos"),
  REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Valida en cada llamada (no al importar el módulo) en vez de una vez al
 * arrancar: así un test puede cambiar `process.env.AUTH_SECRET` entre casos
 * sin reiniciar el proceso. En producción, la primera sesión que se firme o
 * verifique falla rápido y con un mensaje claro si falta configurar el
 * secreto, en vez de arrancar con un valor por defecto inseguro.
 */
export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Variable de entorno inválida (${issue.path.join(".")}): ${issue.message}. Revisa .env.local (ver .env.example).`,
    );
  }
  return parsed.data;
}
