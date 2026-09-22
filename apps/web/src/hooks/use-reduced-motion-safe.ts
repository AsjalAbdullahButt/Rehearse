"use client";

import { useEffect, useState } from "react";

/** True once we know the client prefers reduced motion. False (not undefined) on the server and until measured, so SSR markup matches the common case. */
export function useReducedMotionSafe(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}
