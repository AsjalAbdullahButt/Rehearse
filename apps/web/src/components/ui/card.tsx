import { type HTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tile?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, tile = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "border border-line bg-surface",
          tile ? "rounded-[var(--radius-tile)] p-4" : "rounded-[var(--radius-card)] p-6",
          className,
        )}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";
