import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET debe tener al menos 32 caracteres"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
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
