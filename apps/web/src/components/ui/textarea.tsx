import { type TextareaHTMLAttributes, forwardRef } from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "border-line bg-surface-2 text-text placeholder:text-muted focus-visible:outline-lime min-h-24 w-full resize-y rounded-[var(--radius-tile)] border px-4 py-3 text-sm transition-[border-color,box-shadow] duration-150 ease-[var(--ease-brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
