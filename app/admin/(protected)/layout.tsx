import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { canManageProducts, getSession } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getSession() ya compara el rol con la base: una cuenta que dejó de ser
  // del personal (o que se borró) queda fuera aquí mismo,
  // aunque proxy.ts lo haya dejado pasar por el rol viejo de su cookie.
  const session = await getSession();
  if (!session || !canManageProducts(session.role)) redirect("/admin/login");
  // Contraseña temporal (cuenta nueva o restablecida): primero la cambia.
  if (session.debeCambiarPassword) redirect("/admin/cambiar-clave");

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
