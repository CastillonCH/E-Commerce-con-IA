"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { APP_CONFIG } from "@/lib/config";

/**
 * Login temporal para desbloquear el desarrollo sin backend. El rol se
 * decide en app/api/auth/login/route.ts según `from`. Ver el TODO ahí para
 * la migración a autenticación real contra FastAPI.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, from }),
    });

    setIsLoading(false);

    if (!response.ok) {
      setError("No se pudo iniciar sesión.");
      return;
    }

    router.push(from);
    router.refresh();
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-blue-600/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

        <Link href="/" className="relative text-2xl font-extrabold tracking-tight">
          Nova<span className="text-blue-400">Store</span>
        </Link>

        <div className="relative flex flex-col gap-6">
          <h1 className="max-w-sm text-3xl font-bold leading-tight">
            Compra inteligente, clasificada por IA.
          </h1>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Sparkles className="h-5 w-5 text-orange-400" />
            Recomendaciones y catálogo organizados automáticamente
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <ShieldCheck className="h-5 w-5 text-blue-400" />
            Tus datos y pagos siempre protegidos
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Bot className="h-5 w-5 text-green-400" />
            Asistente virtual 24/7, enlazado a WhatsApp
          </div>
        </div>

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} {APP_CONFIG.storeName}
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <Link href="/" className="mb-6 block text-xl font-extrabold text-slate-900 lg:hidden">
            Nova<span className="text-blue-600">Store</span>
          </Link>
          <h1 className="mb-1 text-xl font-semibold text-slate-900">Bienvenido de vuelta</h1>
          <p className="mb-6 text-sm text-slate-500">Ingresa para continuar tu compra.</p>

          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tucorreo@ejemplo.com"
          />

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={isLoading} className="mt-5 w-full">
            {isLoading ? "Ingresando..." : "Ingresar"}
          </Button>

          <p className="mt-4 text-center text-xs text-slate-400">
            Al continuar aceptas nuestros Términos y Política de Privacidad.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
