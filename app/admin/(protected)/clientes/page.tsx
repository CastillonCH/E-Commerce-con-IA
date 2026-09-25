import { Users } from "lucide-react";
import { MOCK_CLIENTS } from "@/lib/mock-clients";
import { formatCurrency } from "@/lib/utils";

export default function AdminClientsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Clientes registrados en la tienda y su historial de compra.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Registrado</th>
              <th className="px-4 py-3 font-medium">Pedidos</th>
              <th className="px-4 py-3 font-medium">Total gastado</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_CLIENTS.map((client) => (
              <tr
                key={client.id}
                className="border-b border-slate-100 text-slate-700 last:border-0"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      <Users className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-medium text-slate-900">
                        {client.nombre}
                      </p>
                      <p className="text-xs text-slate-500">{client.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{client.fechaRegistro}</td>
                <td className="px-4 py-3">{client.pedidos}</td>
                <td className="px-4 py-3 font-medium">
                  {formatCurrency(client.totalGastado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
