"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, UserPlus } from "lucide-react";
import type { MiembroPersonal, RolPersonal } from "@/lib/data/users-repo";
import {
  crearMiembroAction,
  cambiarActivoAction,
  cambiarRolAction,
  restablecerPasswordAction,
} from "@/app/admin/(protected)/personal/actions";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";

const ETIQUETA_ROL: Record<RolPersonal, string> = {
  ADMIN: "Administrador",
  CATALOGO: "Catálogo",
};

function fecha(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export function PersonalPanel({ personal, miEmail }: { personal: MiembroPersonal[]; miEmail: string }) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<{ email: string; password: string } | null>(null);
  const [porRestablecer, setPorRestablecer] = useState<MiembroPersonal | null>(null);

  async function onCrear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const datos = Object.fromEntries(new FormData(form));
    setGuardando(true);
    const result = await crearMiembroAction(datos);
    setGuardando(false);
    if (!result.success || !result.passwordTemporal) {
      toast.error(result.error ?? "No se pudo crear la cuenta.");
      return;
    }
    setCredencial({ email: String(datos.email).trim(), password: result.passwordTemporal });
    toast.success(`Cuenta creada para ${String(datos.nombre)}.`);
    form.reset();
    setFormAbierto(false);
  }

  async function ejecutar(
    miembro: MiembroPersonal,
    accion: () => Promise<{ success: boolean; error?: string; passwordTemporal?: string }>,
    exito: string,
  ) {
    setProcesandoId(miembro.id);
    const result = await accion();
    setProcesandoId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo actualizar la cuenta.");
      return;
    }
    if (result.passwordTemporal) setCredencial({ email: miembro.email, password: result.passwordTemporal });
    toast.success(exito);
  }

  async function confirmarRestablecer() {
    const miembro = porRestablecer;
    setPorRestablecer(null);
    if (miembro) {
      await ejecutar(miembro, () => restablecerPasswordAction(miembro.id), `Contraseña de ${miembro.nombre} restablecida.`);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiada al portapapeles.");
    } catch {
      toast.error("No se pudo copiar; selecciónala y cópiala a mano.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {credencial && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Contraseña temporal de {credencial.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code data-testid="password-temporal" className="rounded-lg bg-white px-3 py-1.5 font-mono text-base text-slate-900">
              {credencial.password}
            </code>
            <button
              type="button"
              onClick={() => copiar(credencial.password)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium hover:bg-emerald-100"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
          </div>
          <p className="mt-2">
            Entrégasela al empleado por un medio privado. <strong>No se volverá a mostrar</strong>: al ingresar
            por primera vez tendrá que elegir su propia contraseña.
          </p>
          <button type="button" onClick={() => setCredencial(null)} className="mt-2 text-xs font-medium underline">
            Ya la entregué, ocultar
          </button>
        </div>
      )}

      {formAbierto ? (
        <form onSubmit={onCrear} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
          <div>
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input id="nombre" name="nombre" required minLength={2} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="email">Correo de la empresa</Label>
            <Input id="email" name="email" type="email" required placeholder="nombre@novastore.pe" />
          </div>
          <div>
            <Label htmlFor="rol">Rol</Label>
            <Select id="rol" name="rol" defaultValue="CATALOGO">
              <option value="CATALOGO">Catálogo (carga y mantiene productos)</option>
              <option value="ADMIN">Administrador (todo el panel)</option>
            </Select>
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" variant="dark" disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear cuenta"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setFormAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button type="button" variant="dark" onClick={() => setFormAbierto(true)}>
            <UserPlus className="h-4 w-4" />
            Nuevo empleado
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Cuentas del personal</caption>
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th scope="col" className="px-4 py-3 font-medium">Empleado</th>
              <th scope="col" className="px-4 py-3 font-medium">Rol</th>
              <th scope="col" className="px-4 py-3 font-medium">Último ingreso</th>
              <th scope="col" className="px-4 py-3 font-medium">Estado</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {personal.map((miembro) => {
              const soyYo = miembro.email === miEmail;
              const procesando = procesandoId === miembro.id;
              return (
                <tr key={miembro.id} className="border-b border-slate-100 text-slate-700 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {miembro.nombre} {soyYo && <span className="text-xs font-normal text-slate-500">(tú)</span>}
                    </p>
                    <p className="text-xs text-slate-500">{miembro.email}</p>
                    {miembro.debeCambiarPassword && (
                      <p className="mt-0.5 text-xs text-amber-700">Aún con contraseña temporal</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {soyYo ? (
                      ETIQUETA_ROL[miembro.rol]
                    ) : (
                      <select
                        aria-label={`Rol de ${miembro.nombre}`}
                        value={miembro.rol}
                        disabled={procesando}
                        onChange={(event) =>
                          ejecutar(
                            miembro,
                            () => cambiarRolAction(miembro.id, event.target.value),
                            `${miembro.nombre} ahora es ${ETIQUETA_ROL[event.target.value as RolPersonal]}.`,
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900 disabled:opacity-50"
                      >
                        <option value="CATALOGO">{ETIQUETA_ROL.CATALOGO}</option>
                        <option value="ADMIN">{ETIQUETA_ROL.ADMIN}</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{fecha(miembro.ultimoAcceso)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        miembro.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {miembro.activo ? "Activo" : "Desactivado"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!soyYo && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={procesando}
                          onClick={() => setPorRestablecer(miembro)}
                          aria-label={`Restablecer contraseña de ${miembro.nombre}`}
                          title="Restablecer contraseña"
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={procesando}
                          onClick={() =>
                            ejecutar(
                              miembro,
                              () => cambiarActivoAction(miembro.id, !miembro.activo),
                              miembro.activo ? `${miembro.nombre} ya no puede ingresar.` : `${miembro.nombre} puede volver a ingresar.`,
                            )
                          }
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50",
                            miembro.activo
                              ? "text-red-600 hover:bg-red-50"
                              : "text-emerald-700 hover:bg-emerald-50",
                          )}
                        >
                          {miembro.activo ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={porRestablecer !== null}
        title="Restablecer contraseña"
        description={
          porRestablecer
            ? `Se generará una contraseña temporal nueva para ${porRestablecer.nombre}. La actual dejará de funcionar y deberá elegir otra al ingresar.`
            : ""
        }
        confirmLabel="Restablecer"
        onConfirm={confirmarRestablecer}
        onCancel={() => setPorRestablecer(null)}
      />
    </div>
  );
}
