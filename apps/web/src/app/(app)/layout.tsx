import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppNavigation } from "@/components/ui/app-navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { fetchCurrentUser } from "@/lib/interview/server";

import { SignOutButton } from "./sign-out-button";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Belt-and-suspenders: proxy.ts already redirects unauthenticated requests away from this
  // route group by cookie presence/expiry alone. This is the real check — it calls the API,
  // which verifies the token's signature — so a request that slipped past the middleware's
  // best-effort gate (or an expired-but-refreshable session) still lands somewhere correct.
  const user = await fetchCurrentUser();
  if (!user) {
    // proxy.ts forwards the request's own pathname as a header (there's no other way to read
    // it from a Server Component) so this redirect can carry the same `?next=` a
    // middleware-issued redirect would have used, instead of a bare /sign-in that strands the
    // user on /interview after signing in.
    const pathname = (await headers()).get("x-pathname");
    redirect(pathname ? `/sign-in?next=${encodeURIComponent(pathname)}` : "/sign-in");
  }

  return (
    <div className="bg-ink flex flex-1 flex-col">
      <a
        href="#main-content"
        className="bg-lime-fill text-lime-ink sr-only z-50 rounded-[var(--radius-tile)] p-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>
      <header className="border-line shrink-0 border-b sm:flex sm:min-h-16 sm:items-center sm:justify-between sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:contents">
          <div className="flex items-center gap-6">
            <Link href="/interview" className="font-display text-text text-sm font-bold">
              Rehearse
            </Link>
          </div>
          <div className="flex items-center gap-3 sm:order-3">
            <span className="text-muted hidden max-w-40 truncate text-sm lg:inline">
              {user.email}
            </span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
        <AppNavigation />
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
