"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Pause, Play, Archive, ArchiveRestore, Trash2, Loader2, type LucideIcon } from "lucide-react";
import type { ProductStatus } from "@/types";
import type { AdminProduct } from "@/lib/data/products-repo";
import type { AccionEstado } from "@/lib/data/products-repo";
import { cambiarEstadoAction, eliminarProductoAction } from "@/app/admin/(protected)/productos/actions";
import { formatCurrency } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface AccionUI {
  accion: AccionEstado;
  etiqueta: string;
  icono: LucideIcon;
  exito: string;
  peligro?: boolean;
}

const PAUSAR: AccionUI = { accion: "pausar", etiqueta: "Pausar", icono: Pause, exito: "pausado: ya no se ve en la tienda" };
const REACTIVAR: AccionUI = { accion: "reactivar", etiqueta: "Reactivar", icono: Play, exito: "vuelve a estar a la venta" };
const ARCHIVAR: AccionUI = { accion: "archivar", etiqueta: "Archivar", icono: Archive, exito: "archivado", peligro: true };
const RESTAURAR: AccionUI = { accion: "restaurar", etiqueta: "Restaurar", icono: ArchiveRestore, exito: "restaurado" };

// Qué se puede hacer con un producto según su estado.
const ACCIONES: Record<ProductStatus, AccionUI[]> = {
  publicado: [PAUSAR, ARCHIVAR],
  pausado: [REACTIVAR, ARCHIVAR],
  pendiente_revision: [ARCHIVAR],
  rechazado: [ARCHIVAR],
  archivado: [RESTAURAR],
};

const VACIO: Record<ProductStatus, string> = {
  publicado: "No hay productos publicados.",
  pendiente_revision: "No hay productos esperando revisión.",
  rechazado: "No hay productos rechazados.",
  pausado: "No hay productos pausados.",
  archivado: "No hay productos archivados.",
};

// Mismo criterio que eliminarProductoDefinitivo (la Server Action lo vuelve
// a comprobar): sin ventas, y CATALOGO solo lo que nunca estuvo a la venta.
function puedeEliminar(product: AdminProduct, esAdmin: boolean): boolean {
  if (product.vendido) return false;
  return esAdmin || product.estado === "pendiente_revision" || product.estado === "rechazado";
}

export function ProductsTable({
  estado,
  products,
  esAdmin,
}: {
  estado: ProductStatus;
  products: AdminProduct[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(products);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [porArchivar, setPorArchivar] = useState<AdminProduct | null>(null);
  const [porEliminar, setPorEliminar] = useState<AdminProduct | null>(null);

  const editable = estado !== "archivado";

  async function ejecutar(product: AdminProduct, accion: AccionUI) {
    setProcesandoId(product.id);
    const result = await cambiarEstadoAction(product.id, accion.accion);
    setProcesandoId(null);

    if (!result.success) {
      toast.error(result.error ?? "No se pudo cambiar el estado del producto.");
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== product.id));
    toast.success(`"${product.nombre}" ${accion.exito}.`);
    router.refresh(); // actualiza los contadores de las pestañas
  }

  async function confirmarArchivo() {
    const product = porArchivar;
    setPorArchivar(null);
    if (product) await ejecutar(product, ARCHIVAR);
  }

  async function confirmarEliminacion() {
    const product = porEliminar;
    setPorEliminar(null);
    if (!product) return;
    setProcesandoId(product.id);
    const result = await eliminarProductoAction(product.id);
    setProcesandoId(null);
    if (!result.success) {
      toast.error(result.error ?? "No se pudo eliminar el producto.");
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== product.id));
    toast.success(`"${product.nombre}" eliminado definitivamente.`);
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        {VACIO[estado]}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Lista de productos</caption>
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th scope="col" className="px-4 py-3 font-medium">Producto</th>
            <th scope="col" className="px-4 py-3 font-medium">Marca</th>
            <th scope="col" className="px-4 py-3 font-medium">Proveedor</th>
            <th scope="col" className="px-4 py-3 font-medium">Categoría</th>
            <th scope="col" className="px-4 py-3 font-medium">Precio</th>
            <th scope="col" className="px-4 py-3 font-medium">Stock</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => {
            const procesando = procesandoId === product.id;
            return (
              <tr key={product.id} className="border-b border-slate-100 align-top text-slate-700 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{product.nombre}</p>
                  <p className="text-xs text-slate-500">{product.departamento}</p>
                  {product.motivoRechazo && (
                    <p className="mt-1 text-xs text-red-600">
                      Motivo del rechazo: {product.motivoRechazo}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">{product.marca}</td>
                <td className="px-4 py-3">{product.proveedor ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {product.categoria_ia}
                  </span>
                </td>
                <td className="px-4 py-3">{formatCurrency(product.precio)}</td>
                <td className="px-4 py-3">
                  {product.stock === 0 ? <span className="font-medium text-red-600">Agotado</span> : product.stock}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {editable && (
                      <Link
                        href={`/admin/productos/${product.id}/editar`}
                        aria-label={`Editar ${product.nombre}`}
                        title={estado === "rechazado" ? "Corregir y reenviar a revisión" : "Editar"}
                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    )}
                    {ACCIONES[estado].map((accion) => {
                      const Icono = accion.icono;
                      return (
                        <button
                          key={accion.accion}
                          type="button"
                          disabled={procesando}
                          onClick={() => (accion.peligro ? setPorArchivar(product) : ejecutar(product, accion))}
                          aria-label={`${accion.etiqueta} ${product.nombre}`}
                          title={accion.etiqueta}
                          className={
                            accion.peligro
                              ? "rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              : "rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                          }
                        >
                          {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icono className="h-4 w-4" />}
                        </button>
                      );
                    })}
                    {puedeEliminar(product, esAdmin) && (
                      <button
                        type="button"
                        disabled={procesando}
                        onClick={() => setPorEliminar(product)}
                        aria-label={`Eliminar definitivamente ${product.nombre}`}
                        title="Eliminar definitivamente (nunca se vendió)"
                        className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ConfirmDialog
        open={porArchivar !== null}
        title="Archivar producto"
        description={
          porArchivar
            ? `"${porArchivar.nombre}" saldrá de la tienda y de esta lista. Los pedidos antiguos lo conservan, y puedes restaurarlo desde la pestaña Archivados.`
            : ""
        }
        confirmLabel="Archivar"
        onConfirm={confirmarArchivo}
        onCancel={() => setPorArchivar(null)}
      />

      <ConfirmDialog
        open={porEliminar !== null}
        title="Eliminar definitivamente"
        description={
          porEliminar
            ? `"${porEliminar.nombre}" se borrará para siempre, junto con su foto y sus datos de IA. Nunca se vendió, así que ningún pedido se ve afectado. Esta acción NO se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        onConfirm={confirmarEliminacion}
        onCancel={() => setPorEliminar(null)}
      />
    </div>
  );
}
