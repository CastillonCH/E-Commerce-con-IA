import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { OrderHistoryList } from "@/components/shop/OrderHistoryList";

export default async function OrderHistoryPage() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <p className="text-lg font-medium text-slate-900">Inicia sesión para ver tus pedidos</p>
        <Link href="/login?from=/perfil/pedidos">
          <Button className="mt-2">Iniciar sesión</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <Link href="/perfil" className="mb-4 inline-block text-sm font-medium text-brand hover:underline">
        ← Volver a mi perfil
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Mis pedidos</h1>
      <OrderHistoryList email={session.email} />
    </div>
  );
}
