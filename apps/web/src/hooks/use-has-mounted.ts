"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/** True only after the client has hydrated — for values (like next-themes' `theme`) that are
 * genuinely unknown on the server, where rendering them before hydration would mismatch.
 * Deliberately not a `useState`+`useEffect(() => setMounted(true), [])` pair: that pattern is
 * exactly the synchronous-setState-in-an-effect shape the newer react-hooks/set-state-in-effect
 * rule flags. `useSyncExternalStore` with a server/client snapshot pair is the sanctioned way
 * to read this kind of environment fact. */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
