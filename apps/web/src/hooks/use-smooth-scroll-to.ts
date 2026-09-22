"use client";

import { useContext } from "react";

import { LenisContext } from "@/components/theme/smooth-scroll-provider";

const NAV_OFFSET = -88;

/** Smooth-scrolls to a selector, using Lenis when available and falling back to native scroll. */
export function useSmoothScrollTo() {
  const lenisRef = useContext(LenisContext);

  return (selector: string) => {
    if (lenisRef?.current) {
      lenisRef.current.scrollTo(selector, { offset: NAV_OFFSET, duration: 1.1 });
      return;
    }

    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}
