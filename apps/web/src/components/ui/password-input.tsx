"use client";

import { useState } from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({ className, ...props }: Omit<InputProps, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-16", className)} />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="text-muted hover:text-text focus-visible:outline-lime absolute inset-y-0 right-0 min-w-14 rounded-[var(--radius-tile)] px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
