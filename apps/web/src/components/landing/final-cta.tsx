"use client";

import { Aurora } from "@/components/effects/aurora";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { MicOrb } from "@/components/interview/mic-orb";
import { useSmoothScrollTo } from "@/hooks/use-smooth-scroll-to";

export function FinalCta() {
  const scrollTo = useSmoothScrollTo();

  return (
    <section className="relative overflow-hidden border-t border-line bg-ink py-28">
      <Aurora className="opacity-50" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 text-center sm:px-10">
        <MicOrb size={100} animate />
        <h2 className="text-balance font-display text-3xl font-bold tracking-[-0.02em] text-text sm:text-5xl">
          Ready to answer like you&apos;ve done this before?
        </h2>
        <p className="max-w-md text-balance text-base text-muted">
          Pick a role, answer out loud, and see exactly what to improve — in your next
          practice session.
        </p>
        <MagneticButton onClick={() => scrollTo("#roles")}>
          Start a mock interview
        </MagneticButton>
      </div>
    </section>
  );
}
