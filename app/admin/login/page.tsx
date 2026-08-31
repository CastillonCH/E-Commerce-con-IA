"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { APP_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Acceso de STAFF (vendedor/administrador). A propósito NO está enlazado
 * desde la tienda pública ni ofrece registro: solo cuentas ya dadas de alta
 * por la empresa deberían llegar aquí. El selector de rol de abajo es
 * SOLO para poder demostrar ambos paneles sin backend — ver el TODO en
 * app/api/auth/staff-login/route.ts, donde se explica por qué en producción
 * el rol nunca debe salir de un campo que envía el propio formulario.
 */
function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/admin/dashboard";
  const [role, setRole] = useState<"SELLER" | "ADMIN">("SELLER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const response = await fetch("/api/auth/staff-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });

    setIsLoading(false);

    if (!response.ok) {
      setError("No se pudo iniciar sesión.");
      return;
    }

    router.push(role === "ADMIN" ? from : "/admin/productos");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{APP_CONFIG.storeName}</p>
            <p className="text-xs text-slate-500">Acceso interno</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="role">Tipo de cuenta</Label>
            <Select
              id="role"
              value={role}
              onChange={(event) => setRole(event.target.value as "SELLER" | "ADMIN")}
            >
              <option value="SELLER">Vendedor / Encargado de inventario</option>
              <option value="ADMIN">Administrador global</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="email">Email corporativo</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@novastore.pe"
            />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" variant="dark" disabled={isLoading} className={cn("mt-1 w-full")}>
            {isLoading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          ¿Eres cliente?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Ingresa aquí
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense>
      <StaffLoginForm />
    </Suspense>
  );
}
