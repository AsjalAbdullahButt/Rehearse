import { type HTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  neutral: "bg-surface-2 text-muted",
  lime: "bg-lime text-lime-ink",
  violet: "bg-violet/15 text-violet",
  coral: "bg-coral/15 text-coral",
  amber: "bg-amber/15 text-amber",
  mint: "bg-mint/15 text-mint",
} as const;

export type BadgeTone = keyof typeof TONE_CLASSES;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone = "neutral", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium",
          TONE_CLASSES[tone],
          className,
        )}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";
