import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * true solo después de que el componente se hidrató en el cliente. Se usa
 * con useSyncExternalStore (en vez de useState+useEffect) para evitar el
 * anti-patrón de "setState síncrono dentro de un efecto" y, de paso,
 * distinguir explícitamente el snapshot del servidor (false) del cliente
 * (true) — necesario para estado que solo existe en el cliente, como un
 * store de Zustand persistido en localStorage.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
