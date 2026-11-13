import { getSession } from "@/lib/auth";
import { modoCargaPorDefecto } from "@/lib/modo-carga";
import { listPersonal } from "@/lib/data/users-repo";
import { PersonalPanel } from "@/components/admin/PersonalPanel";

export default async function PersonalPage() {
  const [session, personal] = await Promise.all([getSession(), listPersonal()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Personal</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cuentas de los empleados de NovaStore. Solo un administrador las crea:
          el empleado recibe una contraseña temporal y la cambia al ingresar.
          Los clientes no aparecen aquí, porque se registran solos en la tienda.
        </p>
      </div>

      <PersonalPanel
        personal={personal}
        miEmail={session?.email ?? ""}
        modoPorDefecto={modoCargaPorDefecto()}
      />
    </div>
  );
}
