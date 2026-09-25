import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
