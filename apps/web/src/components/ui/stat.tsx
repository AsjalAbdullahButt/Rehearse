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
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="font-mono-metric text-2xl tabular-nums text-text">
        {value}
        {unit ? <span className="ml-1 text-sm text-muted">{unit}</span> : null}
      </span>
    </div>
  );
}
