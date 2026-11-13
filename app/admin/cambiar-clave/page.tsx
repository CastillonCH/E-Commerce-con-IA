import { redirect } from "next/navigation";
import { canManageProducts, getSession } from "@/lib/auth";
import { safeRedirect } from "@/lib/safe-redirect";
import { CambiarClaveForm } from "@/components/admin/CambiarClaveForm";

interface CambiarClavePageProps {
  searchParams: Promise<{ from?: string }>;
}

// Fuera de (protected) a propósito: ese layout manda aquí a quien tiene una
// contraseña temporal, así que esta página no puede depender de él.
export default async function CambiarClavePage({ searchParams }: CambiarClavePageProps) {
  const session = await getSession();
  if (!session || !canManageProducts(session.role)) redirect("/admin/login");

  const { from } = await searchParams;
  const inicio = session.role === "ADMIN" ? "/admin/dashboard" : "/admin/productos";
  const destino = safeRedirect(from ?? null, inicio);

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <CambiarClaveForm
        nombre={session.name}
        obligatorio={Boolean(session.debeCambiarPassword)}
        destino={destino.startsWith("/admin") ? destino : inicio}
      />
    </main>
  );
}
