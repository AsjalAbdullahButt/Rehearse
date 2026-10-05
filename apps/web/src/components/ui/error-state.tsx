import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The one shape for "something went wrong": a plain-language title, what it means for the
 * user's work, a recovery action, and (unobtrusively) a reference ID support can search logs for.
 * Never render raw backend/exception text here. */
export function ErrorState({
  title,
  description,
  actions,
  requestId,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  requestId?: string | null;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 text-center", className)}>
      <h1 className="font-display text-text text-xl font-bold text-balance">{title}</h1>
      {description ? <p className="text-muted max-w-sm text-sm">{description}</p> : null}
      {actions ? <div className="flex flex-wrap justify-center gap-3">{actions}</div> : null}
      {requestId ? (
        <p className="text-muted font-mono-metric text-xs">Reference: {requestId}</p>
      ) : null}
    </div>
  );
}
