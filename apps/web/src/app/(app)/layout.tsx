import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

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
    redirect("/sign-in");
  }

  return (
    <div className="bg-ink flex flex-1 flex-col">
      <header className="border-line flex h-16 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-6">
          <Link href="/interview" className="font-display text-text text-sm font-bold">
            Rehearse
          </Link>
          <nav className="hidden items-center gap-4 sm:flex">
            <Link
              href="/interview"
              className="text-muted hover:text-text text-sm transition-colors"
            >
              Interview
            </Link>
            <Link href="/progress" className="text-muted hover:text-text text-sm transition-colors">
              Progress
            </Link>
            <Link href="/settings" className="text-muted hover:text-text text-sm transition-colors">
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted hidden text-sm md:inline">{user.email}</span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
