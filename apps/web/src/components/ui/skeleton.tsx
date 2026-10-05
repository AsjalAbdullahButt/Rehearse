import { cn } from "@/lib/utils";

/** A placeholder block. Decorative: the page region that wraps skeletons should carry
 * `aria-busy` and a visually-hidden status message. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-surface-2 animate-pulse rounded-[var(--radius-tile)]", className)}
    />
  );
}
