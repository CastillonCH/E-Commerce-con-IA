import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  return (
    // En escritorio la barra lateral queda fija (sticky, alto de pantalla)
    // y solo se desplaza <main>; en celular pasa a ser un menú deslizable.
    <div className="flex flex-1 flex-col lg:flex-row">
      <AdminSidebar session={session} />
      <main
        id="main-content"
        className="min-w-0 flex-1 overflow-x-hidden bg-slate-50 p-4 sm:p-6 lg:p-8"
      >
        {children}
      </main>
    </div>
  );
}
