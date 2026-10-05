import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? (
          <p className="text-muted text-xs font-medium tracking-wide uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-text text-2xl font-bold text-balance sm:text-3xl">
          {title}
        </h1>
        {description ? <p className="text-muted max-w-prose text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
