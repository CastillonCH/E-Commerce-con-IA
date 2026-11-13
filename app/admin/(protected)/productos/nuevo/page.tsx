import { getSession } from "@/lib/auth";
import { getServerEnv } from "@/lib/env.server";
import { listProveedoresActivos } from "@/lib/data/proveedores-repo";
import { formatearDuracion, obtenerMetricasCarga, type ResumenCarga } from "@/lib/data/carga-repo";
import { NewProductForm } from "@/components/admin/NewProductForm";

export default async function AdminNewProductPage() {
  const session = await getSession();
  const [proveedores, mios] = await Promise.all<[ReturnType<typeof listProveedoresActivos>, Promise<ResumenCarga>]>([
    listProveedoresActivos(),
    session ? obtenerMetricasCarga(session.email) : Promise.resolve({}),
  ]);
  const modo = getServerEnv().MODO_CATALOGO;

  const fichas = (mios.manual?.fichas ?? 0) + (mios.asistido?.fichas ?? 0);
  const resumen =
    fichas > 0 ? (
      <p className="mb-6 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600" data-testid="mis-numeros">
        Tus fichas medidas: <strong>{fichas}</strong>
        {mios.asistido && <> · con IA: {formatearDuracion(mios.asistido.segMediana)} por ficha</>}
        {mios.manual && <> · sin IA: {formatearDuracion(mios.manual.segMediana)} por ficha</>}
        {mios.asistido?.pctSugerenciasAceptadas !== null && mios.asistido?.pctSugerenciasAceptadas !== undefined && (
          <> · aceptaste el {Math.round(mios.asistido.pctSugerenciasAceptadas)}% de las sugerencias</>
        )}
      </p>
    ) : null;

  return <NewProductForm proveedores={proveedores} modo={modo} resumen={resumen} />;
}
