"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  label: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ pressed, onPressedChange, label, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={pressed}
        aria-label={label}
        onClick={() => onPressedChange(!pressed)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-[var(--radius-pill)] border border-line transition-colors duration-150 ease-[var(--ease-brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
          pressed ? "bg-lime" : "bg-surface-2",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "inline-block size-4 rounded-full bg-surface shadow transition-transform duration-150 ease-[var(--ease-brand)]",
            pressed ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    );
  },
);
Toggle.displayName = "Toggle";
