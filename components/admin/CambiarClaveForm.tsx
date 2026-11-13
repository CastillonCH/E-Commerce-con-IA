"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, ArrowLeft } from "lucide-react";
import { cambiarClaveAction } from "@/app/admin/cambiar-clave/actions";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export function CambiarClaveForm({
  nombre,
  obligatorio,
  destino,
}: {
  nombre: string;
  obligatorio: boolean;
  destino: string;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setGuardando(true);
    const datos = Object.fromEntries(new FormData(event.currentTarget));
    const result = await cambiarClaveAction(datos);
    setGuardando(false);
    if (!result.success) {
      setError(result.error ?? "No se pudo cambiar la contraseña.");
      return;
    }
    toast.success("Contraseña actualizada.");
    router.push(destino);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      {!obligatorio && (
        <Link
          href={destino}
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al panel
        </Link>
      )}

      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Cambiar contraseña</h1>
      </div>

      {obligatorio && (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Hola, {nombre.split(" ")[0]}. Entraste con una contraseña temporal: elige una
          propia para continuar. Nadie más la conocerá, ni el administrador.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="actual">{obligatorio ? "Contraseña temporal" : "Contraseña actual"}</Label>
          <Input id="actual" name="actual" type="password" autoComplete="current-password" required />
        </div>
        <div>
          <Label htmlFor="nueva">Nueva contraseña</Label>
          <Input id="nueva" name="nueva" type="password" autoComplete="new-password" required minLength={10} />
          <p className="mt-1 text-xs text-slate-500">Mínimo 10 caracteres, con letras y números.</p>
        </div>
        <div>
          <Label htmlFor="confirmacion">Repite la nueva contraseña</Label>
          <Input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" required />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <Button type="submit" variant="dark" disabled={guardando} className="mt-1 w-full">
          {guardando ? "Guardando..." : "Guardar contraseña"}
        </Button>
      </form>

      {obligatorio && (
        <form action="/api/auth/logout" method="post" className="mt-4 text-center">
          <button type="submit" className="text-xs font-medium text-slate-500 hover:text-slate-900">
            Cerrar sesión
          </button>
        </form>
      )}
    </div>
  );
}
