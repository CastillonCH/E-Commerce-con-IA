"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { GoogleIcon } from "@/components/shop/GoogleIcon";
import { cn } from "@/lib/utils";

const ERROR_MESSAGES: Record<string, string> = {
  google_failed: "No se pudo completar el ingreso con Google. Intenta de nuevo.",
  google_not_configured:
    "El ingreso con Google todavía no está configurado en este entorno.",
};

/**
 * Login/registro de CLIENTES (Google + correo). El staff (vendedor y
 * administrador) usa /admin/login, que no está enlazado desde aquí — ver
 * el TODO ahí sobre por qué el rol nunca debe elegirse en un formulario
 * público.
 */
function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";
  const errorCode = searchParams.get("error");
  const [tab, setTab] = useState<"login" | "register">(
    searchParams.get("tab") === "register" ? "register" : "login"
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorCode ? ERROR_MESSAGES[errorCode] ?? null : null
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = tab === "login" ? { email, password } : { name, email, password };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setIsLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.detail ?? "No se pudo completar la solicitud.");
      return;
    }

    router.push(from);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-slate-900">
          Nova<span className="text-brand">Store</span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex rounded-full bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={cn(
                "flex-1 rounded-full py-2 text-sm font-semibold transition-colors",
                tab === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              )}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={cn(
                "flex-1 rounded-full py-2 text-sm font-semibold transition-colors",
                tab === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              )}
            >
              Crear cuenta
            </button>
          </div>

          <h1 className="mb-1 text-2xl font-bold text-slate-900">
            {tab === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            {tab === "login"
              ? "Ingresa para continuar tu compra."
              : "Regístrate para comprar, guardar tus direcciones y ver tus pedidos."}
          </p>

          <a
            href={`/api/auth/google?from=${encodeURIComponent(from)}`}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-300 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
          >
            <GoogleIcon className="h-5 w-5" />
            Continuar con Google
          </a>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-500">o con tu correo</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {tab === "register" && (
              <div>
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tucorreo@ejemplo.com"
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" disabled={isLoading} className="mt-1 w-full">
              {isLoading
                ? "Procesando..."
                : tab === "login"
                  ? "Ingresar"
                  : "Crear cuenta"}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            Al continuar aceptas nuestros Términos y Política de Privacidad.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
