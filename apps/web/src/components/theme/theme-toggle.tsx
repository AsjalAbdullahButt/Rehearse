"use client";

import { useTheme } from "next-themes";
import { useRef, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};

/** True only after the client has hydrated, avoiding SSR/CSR theme mismatches. */
function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mounted = useHasMounted();

  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!document.startViewTransition || prefersReducedMotion) {
      setTheme(next);
      return;
    }

    const button = buttonRef.current;
    const { x, y } = button?.getBoundingClientRect() ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const cx = button ? x + button.offsetWidth / 2 : x;
    const cy = button ? y + button.offsetHeight / 2 : y;
    const radius = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy),
    );

    const transition = document.startViewTransition(() => {
      setTheme(next);
    });

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${cx}px ${cy}px)`, `circle(${radius}px at ${cx}px ${cy}px)`],
          },
          {
            duration: 500,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // Transition was skipped; theme already applied via setTheme above.
      });
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleTheme}
      aria-label={
        mounted ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode` : "Toggle theme"
      }
      className={cn(
        "border-line bg-surface-2 text-text hover:bg-surface focus-visible:outline-lime inline-flex size-10 items-center justify-center rounded-[var(--radius-pill)] border transition-colors duration-150 ease-[var(--ease-brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
    >
      {mounted && resolvedTheme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
          <path
            d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 15a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm9-6a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM6 12a1 1 0 01-1 1H4a1 1 0 110-2h1a1 1 0 011 1zm11.657-6.657a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM7.05 16.95a1 1 0 010 1.414l-.707.707A1 1 0 114.93 17.66l.707-.707a1 1 0 011.414 0zm11.021 1.414a1 1 0 01-1.414 0l-.707-.707a1 1 0 111.414-1.414l.707.707a1 1 0 010 1.414zM7.05 7.05a1 1 0 01-1.414 0l-.707-.707A1 1 0 116.343 4.93l.707.707a1 1 0 010 1.414zM12 7a5 5 0 100 10 5 5 0 000-10z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
