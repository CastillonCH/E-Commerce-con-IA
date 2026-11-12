"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

export const THEME_STORAGE_KEY = "novastore-theme";
const THEME_EVENT = "novastore-theme-change";

// Se inyecta en <head> (app/layout.tsx) y corre antes de pintar: aplica
// el tema guardado o, si nunca se eligió, el del sistema operativo. Así
// la página no "parpadea" en claro al cargar en modo oscuro.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback); // cambios desde otra pestaña
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function useIsDark(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => null, // en el servidor no se sabe: el botón espera a hidratar
  );
}

function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // modo privado / almacenamiento bloqueado: el cambio vale para esta visita
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const isDark = useIsDark();
  const label = isDark ? "Activar modo claro" : "Activar modo oscuro";

  return (
    <button
      type="button"
      onClick={() => setTheme(!isDark)}
      aria-label={showLabel ? undefined : label}
      title={label}
      disabled={isDark === null}
      className={cn(
        "flex items-center gap-3 rounded-full p-2 text-slate-700 transition-colors hover:bg-slate-100",
        className,
      )}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      {showLabel && <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>}
    </button>
  );
}

// El Toaster de sonner tiene su propio tema; lo sincroniza con el del sitio.
export function ThemedToaster() {
  const isDark = useIsDark();
  return <Toaster richColors position="top-right" theme={isDark ? "dark" : "light"} />;
}
