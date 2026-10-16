"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import type { Vendedor } from "@/types";
import {
  approveVendorAction,
  rejectVendorAction,
} from "@/app/admin/(protected)/vendedores/actions";

export function VendorApplications({ items }: { items: Vendedor[] }) {
  const router = useRouter();
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No hay solicitudes pendientes.
      </div>
    );
  }

  async function handleDecision(vendor: Vendedor, approved: boolean) {
    setProcessingId(vendor.id);
    const result = await (approved ? approveVendorAction : rejectVendorAction)(
      vendor.id,
    );
    setProcessingId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo procesar la solicitud.");
      return;
    }
    toast[approved ? "success" : "error"](
      approved
        ? `${vendor.nombre} fue aprobado como vendedor.`
        : `Se rechazó la solicitud de ${vendor.nombre}.`,
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((vendor) => {
        const isProcessing = processingId === vendor.id;
        return (
          <div
            key={vendor.id}
            className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{vendor.nombre}</p>
              <p className="text-xs text-slate-500">{vendor.email}</p>
              <p className="mt-1 text-xs text-slate-500">
                Categoría:{" "}
                <span className="font-medium text-slate-700">
                  {vendor.categoria ?? "Sin definir"}
                </span>{" "}
                · Solicitado el {vendor.fecha}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => handleDecision(vendor, true)}
                disabled={isProcessing}
                className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Aprobar
              </button>
              <button
                type="button"
                onClick={() => handleDecision(vendor, false)}
                disabled={isProcessing}
                className="flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Rechazar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
