"use client";

import { type ReactNode, useId } from "react";

import { cn } from "@/lib/utils";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}

export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const id = useId();

  return (
    <span className="group relative inline-flex">
      <span aria-describedby={id}>{children}</span>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "border-line bg-surface-2 text-text pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-tile)] border px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 shadow-lg transition-opacity duration-150 ease-[var(--ease-brand)] group-focus-within:opacity-100 group-hover:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
