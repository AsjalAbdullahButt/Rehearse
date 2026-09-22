import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function MarketingHome() {
  return (
    <div className="bg-dot-grid flex flex-1 flex-col bg-ink">
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <span className="font-display text-lg font-bold tracking-tight text-text">Rehearse</span>
        <div className="flex items-center gap-3">
          <Link href="/styleguide" className="text-sm text-muted transition-colors hover:text-text">
            Styleguide
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <Badge tone="violet">Phase 1 — foundation</Badge>
        <h1 className="max-w-2xl text-balance font-display text-[clamp(44px,7vw,84px)] font-bold leading-[1.02] tracking-[-0.035em] text-text">
          Rehearse your next interview out loud
        </h1>
        <p className="max-w-md text-balance text-base text-muted">
          The landing experience arrives in Phase 2, built pixel-faithfully from the design
          mockups. This placeholder confirms tokens, fonts and theming are wired correctly.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary">Start practicing</Button>
          <Button variant="secondary">How it works</Button>
        </div>

        <Card className="mt-10 max-w-sm text-left">
          <p className="text-sm text-muted">
            Dark and light tokens, Bricolage Grotesque / Geist / JetBrains Mono fonts, and the
            brand easing curve are all live. Visit <Link href="/styleguide" className="text-lime underline underline-offset-4">/styleguide</Link> for the full primitive set.
          </p>
        </Card>
      </main>
    </div>
  );
}
