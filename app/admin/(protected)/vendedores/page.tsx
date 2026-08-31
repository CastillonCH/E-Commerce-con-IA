"use client";

import { useState } from "react";
import { Check, X, Store } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VendorApplication {
  id: string;
  nombre: string;
  email: string;
  categoria: string;
  fecha: string;
}

const INITIAL_PENDING: VendorApplication[] = [
  { id: "v1", nombre: "Andrea Quispe", email: "andrea@modaperu.pe", categoria: "Moda", fecha: "28 ago 2026" },
  { id: "v2", nombre: "Carlos Ramírez", email: "carlos@techstore.pe", categoria: "Electrónica", fecha: "27 ago 2026" },
];

const ACTIVE_SELLERS = [
  { id: "s1", nombre: "SoundMax Perú", email: "contacto@soundmax.pe", productos: 3 },
  { id: "s2", nombre: "HogarPlus", email: "ventas@hogarplus.pe", productos: 2 },
  { id: "s3", nombre: "ProSport", email: "hola@prosport.pe", productos: 2 },
];

/**
 * Aprobación de vendedores — solo ADMIN (ver proxy.ts). Datos simulados:
 * cuando exista el backend, reemplazar por GET/POST a
 * `${APP_CONFIG.apiUrl}/api/vendedores` y `/api/vendedores/:id/aprobar`.
 */
export default function VendorsPage() {
  const [pending, setPending] = useState(INITIAL_PENDING);

  function handleDecision(vendor: VendorApplication, approved: boolean) {
    setPending((prev) => prev.filter((v) => v.id !== vendor.id));
    toast[approved ? "success" : "error"](
      approved
        ? `${vendor.nombre} fue aprobado como vendedor.`
        : `Se rechazó la solicitud de ${vendor.nombre}.`
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Vendedores</h1>
        <p className="mt-1 text-sm text-slate-500">
          Aprueba nuevas solicitudes y supervisa a los vendedores activos de la plataforma.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Solicitudes pendientes {pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No hay solicitudes pendientes.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((vendor) => (
              <div
                key={vendor.id}
                className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{vendor.nombre}</p>
                  <p className="text-xs text-slate-500">{vendor.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Categoría: <span className="font-medium text-slate-700">{vendor.categoria}</span> · Solicitado el {vendor.fecha}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleDecision(vendor, true)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Aprobar
                  </button>
                  <button
                    onClick={() => handleDecision(vendor, false)}
                    className="flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Vendedores activos</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 font-medium">Vendedor</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Productos</th>
              </tr>
            </thead>
            <tbody>
              {ACTIVE_SELLERS.map((seller) => (
                <tr key={seller.id} className="border-b border-slate-100 text-slate-700 last:border-0">
                  <td className="flex items-center gap-2 px-4 py-3">
                    <Store className="h-4 w-4 text-slate-400" />
                    {seller.nombre}
                  </td>
                  <td className="px-4 py-3">{seller.email}</td>
                  <td className="px-4 py-3">{seller.productos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
