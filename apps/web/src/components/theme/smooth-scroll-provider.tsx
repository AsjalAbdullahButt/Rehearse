"use client";

import type { ReactNode } from "react";

import { useLenis } from "@/hooks/use-lenis";

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useLenis();
  return <>{children}</>;
}
