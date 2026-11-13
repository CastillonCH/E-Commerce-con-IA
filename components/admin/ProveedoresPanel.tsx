"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Truck } from "lucide-react";
import type { Proveedor } from "@/types";
import {
  crearProveedorAction,
  cambiarProveedorActivoAction,
} from "@/app/admin/(protected)/proveedores/actions";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function ProveedoresPanel({ proveedores }: { proveedores: Proveedor[] }) {
  const [formAbierto, setFormAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const datos = Object.fromEntries(new FormData(form));
    setGuardando(true);
    const result = await crearProveedorAction(datos);
    setGuardando(false);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo guardar el proveedor.");
      return;
    }
    toast.success(`Proveedor "${String(datos.nombre)}" agregado.`);
    form.reset();
    setFormAbierto(false);
  }

  async function alternarActivo(proveedor: Proveedor) {
    setProcesandoId(proveedor.id);
    const result = await cambiarProveedorActivoAction(proveedor.id, !proveedor.activo);
    setProcesandoId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo actualizar el proveedor.");
      return;
    }
    toast.success(proveedor.activo ? `${proveedor.nombre} desactivado.` : `${proveedor.nombre} activado.`);
  }

  return (
    <div className="flex flex-col gap-4">
      {formAbierto ? (
        <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="nombre">Nombre comercial</Label>
            <Input id="nombre" name="nombre" required minLength={2} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="razonSocial">Razón social (opcional)</Label>
            <Input id="razonSocial" name="razonSocial" maxLength={160} />
          </div>
          <div>
            <Label htmlFor="ruc">RUC (opcional)</Label>
            <Input id="ruc" name="ruc" inputMode="numeric" maxLength={11} placeholder="20123456789" />
          </div>
          <div>
            <Label htmlFor="email">Correo de contacto (opcional)</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div>
            <Label htmlFor="telefono">Teléfono (opcional)</Label>
            <Input id="telefono" name="telefono" maxLength={20} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="dark" disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar proveedor"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setFormAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button type="button" variant="dark" onClick={() => setFormAbierto(true)}>
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </Button>
        </div>
      )}

      {proveedores.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Todavía no hay proveedores registrados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Lista de proveedores</caption>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th scope="col" className="px-4 py-3 font-medium">Proveedor</th>
                <th scope="col" className="px-4 py-3 font-medium">RUC</th>
                <th scope="col" className="px-4 py-3 font-medium">Contacto</th>
                <th scope="col" className="px-4 py-3 font-medium">Productos a la venta</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((proveedor) => (
                <tr key={proveedor.id} className="border-b border-slate-100 text-slate-700 last:border-0">
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      <Truck className="h-4 w-4 text-slate-400" />
                      {proveedor.nombre}
                    </p>
                    {proveedor.razonSocial && <p className="text-xs text-slate-500">{proveedor.razonSocial}</p>}
                  </td>
                  <td className="px-4 py-3">{proveedor.ruc ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">
                    {proveedor.email ?? <span className="text-slate-400">—</span>}
                    {proveedor.telefono && <p className="text-xs text-slate-500">{proveedor.telefono}</p>}
                  </td>
                  <td className="px-4 py-3">{proveedor.productos}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => alternarActivo(proveedor)}
                      disabled={procesandoId === proveedor.id}
                      aria-label={`${proveedor.activo ? "Desactivar" : "Activar"} ${proveedor.nombre}`}
                      title={proveedor.activo ? "Desactivar (sus productos siguen a la venta)" : "Activar"}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                        proveedor.activo
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                      )}
                    >
                      {proveedor.activo ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
