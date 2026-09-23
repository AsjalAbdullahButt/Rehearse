"use client";

import { useMotionValueEvent, useScroll } from "motion/react";
import { type MouseEvent, useState } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useSmoothScrollTo } from "@/hooks/use-smooth-scroll-to";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#roles", label: "Question bank" },
  { href: "#progress", label: "Progress" },
] as const;

export function Nav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const scrollTo = useSmoothScrollTo();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 24);
  });

  const handleNavClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    scrollTo(href);
    window.history.pushState(null, "", href);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-300 ease-[var(--ease-brand)]",
        scrolled ? "border-line bg-ink/80 backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <a
          href="#top"
          onClick={(e) => handleNavClick(e, "#top")}
          className="font-display text-text flex items-center gap-2 text-lg font-bold tracking-tight"
        >
          <span className="bg-lime text-lime-ink flex size-7 items-center justify-center rounded-full">
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
              <path
                d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.93V21h2v-2.07A7 7 0 0019 12h-2z"
                fill="currentColor"
              />
            </svg>
          </span>
          Rehearse
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="text-muted hover:text-text text-sm transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <a
            href="/sign-in"
            className="text-muted hover:text-text hidden text-sm transition-colors sm:inline"
          >
            Sign in
          </a>
          <a
            href="#roles"
            onClick={(e) => handleNavClick(e, "#roles")}
            className="bg-lime text-lime-ink inline-flex h-10 items-center justify-center rounded-[var(--radius-pill)] px-4 text-sm font-medium transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110 sm:px-5"
          >
            Start practicing
          </a>
        </div>
      </div>
    </header>
  );
}
