import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** For a list/section that has no data yet: say what it will hold and offer the next step. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-line flex flex-col items-center gap-3 rounded-[var(--radius-tile)] border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <h2 className="text-text text-base font-semibold">{title}</h2>
      <p className="text-muted max-w-sm text-sm">{description}</p>
      {action}
    </div>
  );
}
