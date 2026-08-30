"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

/**
 * Login temporal para desbloquear el desarrollo de /admin sin backend.
 * Ver TODO en app/api/auth/login/route.ts.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      body: JSON.stringify({ email }),
    });

    setIsLoading(false);

    if (!response.ok) {
      setError("No se pudo iniciar sesión.");
      return;
    }

    router.push(searchParams.get("from") ?? "/admin/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6"
      >
        <h1 className="mb-6 text-lg font-semibold text-slate-900">
          Acceso administrador
        </h1>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@tienda.com"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={isLoading} className="mt-4 w-full">
          {isLoading ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
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
