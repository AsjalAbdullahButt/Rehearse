import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  unit?: string;
}

export function Stat({ label, value, unit, className, ...props }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      <span className="text-muted text-xs tracking-wide uppercase">{label}</span>
      <span className="font-mono-metric text-text text-2xl tabular-nums">
        {value}
        {unit ? <span className="text-muted ml-1 text-sm">{unit}</span> : null}
      </span>
    </div>
  );
}
