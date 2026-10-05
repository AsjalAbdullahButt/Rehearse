"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
const destinations = [
  { href: "/dashboard", label: "Home" },
  { href: "/interview", label: "Interview" },
  { href: "/mastery", label: "Skills" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];
export function AppNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main navigation"
      className="border-line flex flex-wrap justify-center gap-1 border-t px-2 py-2 sm:gap-2 sm:border-0 sm:p-0"
    >
      {destinations.map(({ href, label }) => {
        const active =
          pathname.startsWith(href) ||
          (href === "/interview" && pathname.startsWith("/report")) ||
          (href === "/progress" && pathname.startsWith("/session"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:outline-lime flex min-h-11 items-center justify-center rounded-[var(--radius-pill)] px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4",
              active ? "bg-lime/10 text-lime" : "text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
