import { AdminSidebar } from "@/components/admin/AdminSidebar";

/**
 * El acceso a /admin ya está bloqueado a nivel de servidor por proxy.ts;
 * este layout solo se encarga del chrome visual (sidebar + área principal).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <AdminSidebar />
      <main className="flex-1 overflow-x-hidden bg-slate-50 p-6 sm:p-8">
        {children}
      </main>
    </div>
  );
}
