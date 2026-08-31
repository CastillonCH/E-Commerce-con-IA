import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getSession } from "@/lib/auth";

/**
 * El acceso a /admin ya está bloqueado y segmentado por rol a nivel de
 * servidor por proxy.ts; este layout solo se encarga del chrome visual
 * (sidebar + área principal). El `redirect` de abajo es un respaldo
 * defensivo, no la protección real — no debería ejecutarse nunca en
 * condiciones normales.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="flex flex-1">
      <AdminSidebar session={session} />
      <main className="flex-1 overflow-x-hidden bg-slate-50 p-6 sm:p-8">
        {children}
      </main>
    </div>
  );
}
