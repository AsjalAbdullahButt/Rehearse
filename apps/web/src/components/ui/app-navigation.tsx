"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
const destinations = [
  { href: "/interview", label: "Interview" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];
export function AppNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main navigation"
      className="border-line flex justify-center gap-2 border-t px-4 py-2 sm:border-0 sm:p-0"
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
              "focus-visible:outline-lime flex min-h-11 items-center justify-center rounded-[var(--radius-pill)] px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2",
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
