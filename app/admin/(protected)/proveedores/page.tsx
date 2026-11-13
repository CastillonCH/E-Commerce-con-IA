import { listProveedores } from "@/lib/data/proveedores-repo";
import { ProveedoresPanel } from "@/components/admin/ProveedoresPanel";

export default async function ProveedoresPage() {
  const proveedores = await listProveedores();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Proveedores</h1>
        <p className="mt-1 text-sm text-slate-500">
          Empresas a las que NovaStore compra la mercadería. Son solo datos de
          contacto: no entran al sistema ni publican productos. Al cargar un
          producto puedes indicar a qué proveedor se le compra.
        </p>
      </div>

      <ProveedoresPanel proveedores={proveedores} />
    </div>
  );
}
