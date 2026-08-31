import Link from "next/link";
import { Package, MapPin, Bot } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

const SECTIONS = [
  { icon: Package, title: "Mis pedidos", subtitle: "Revisa el estado de tus compras" },
  { icon: MapPin, title: "Direcciones", subtitle: "Administra tus direcciones de envío" },
  { icon: Bot, title: "Asistente virtual", subtitle: "Habla con nuestro asistente o por WhatsApp" },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador global",
  SELLER: "Vendedor",
  CLIENT: "Cliente",
};

/**
 * Cuando exista `GET /api/usuarios/me` en el backend, esta página debe
 * consumirlo y mostrar los datos reales de `User` (types/index.ts) en vez
 * de solo lo que hay en la cookie de sesión.
 */
export default async function ProfilePage() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <p className="text-lg font-medium text-slate-900">Aún no iniciaste sesión</p>
        <p className="text-sm text-slate-500">Ingresa para ver tu perfil, pedidos y direcciones.</p>
        <Link href="/login?from=/perfil">
          <Button className="mt-2">Iniciar sesión</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-semibold text-white">
          {session.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{session.name}</h1>
          <p className="text-sm text-slate-500">
            {session.email} · {ROLE_LABEL[session.role]}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SECTIONS.map(({ icon: Icon, title, subtitle }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
            <Icon className="mb-3 h-5 w-5 text-brand" />
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
