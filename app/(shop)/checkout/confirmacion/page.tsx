import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ConfirmationPageProps {
  searchParams: Promise<{ pedido?: string }>;
}

export default async function CheckoutConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const { pedido } = await searchParams;

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <div className="flex h-16 w-16 animate-[pop-in_0.4s_ease-out] items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-9 w-9 text-green-600" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900">¡Pedido confirmado!</h1>
      {pedido && (
        <p className="text-sm text-slate-500">
          Número de pedido: <span className="font-semibold text-slate-900">{pedido}</span>
        </p>
      )}
      <p className="text-sm text-slate-500">
        Te avisaremos por correo cuando tu pedido esté en camino.
      </p>
      <div className="mt-3 flex gap-3">
        <Link href="/perfil/pedidos">
          <Button variant="outline">Ver mis pedidos</Button>
        </Link>
        <Link href="/">
          <Button>Seguir comprando</Button>
        </Link>
      </div>
    </div>
  );
}
