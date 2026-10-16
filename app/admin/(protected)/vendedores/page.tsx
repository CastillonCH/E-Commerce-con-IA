import { Store } from "lucide-react";
import { listPendingVendedores, listActiveVendedores } from "@/lib/data/users-repo";
import { VendorApplications } from "@/components/admin/VendorApplications";

export default async function VendorsPage() {
  const [pending, active] = await Promise.all([
    listPendingVendedores(),
    listActiveVendedores(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Vendedores</h1>
        <p className="mt-1 text-sm text-slate-500">
          Aprueba nuevas solicitudes y supervisa a los vendedores activos de la
          plataforma.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Solicitudes pendientes {pending.length > 0 && `(${pending.length})`}
        </h2>
        <VendorApplications items={pending} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Vendedores activos
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Lista de vendedores activos</caption>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th scope="col" className="px-4 py-3 font-medium">Vendedor</th>
                <th scope="col" className="px-4 py-3 font-medium">Email</th>
                <th scope="col" className="px-4 py-3 font-medium">Productos</th>
              </tr>
            </thead>
            <tbody>
              {active.map((seller) => (
                <tr
                  key={seller.id}
                  className="border-b border-slate-100 text-slate-700 last:border-0"
                >
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
