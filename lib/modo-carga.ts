import "server-only";
import { getServerEnv } from "@/lib/env.server";
import { obtenerModoCarga, type ModoCarga } from "@/lib/data/users-repo";

/** Modo por defecto del servidor (MODO_CATALOGO), para quien no tenga uno elegido. */
export function modoCargaPorDefecto(): ModoCarga {
  return getServerEnv().MODO_CATALOGO === "asistido" ? "asistido" : "manual";
}

/** Modo del empleado (lo elige un ADMIN en /admin/personal) o, si no tiene, el del servidor. */
export async function modoCargaDe(email: string): Promise<ModoCarga> {
  return obtenerModoCarga(email, modoCargaPorDefecto());
}
