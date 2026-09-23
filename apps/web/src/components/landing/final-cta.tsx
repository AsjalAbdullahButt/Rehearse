"use client";

import { useRouter } from "next/navigation";

import { Aurora } from "@/components/effects/aurora";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { MicOrb } from "@/components/interview/mic-orb";

export function FinalCta() {
  const router = useRouter();

  return (
    <section className="border-line bg-ink relative overflow-hidden border-t py-28">
      <Aurora className="opacity-50" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 text-center sm:px-10">
        <MicOrb size={100} animate />
        <h2 className="font-display text-text text-3xl font-bold tracking-[-0.02em] text-balance sm:text-5xl">
          Ready to answer like you&apos;ve done this before?
        </h2>
        <p className="text-muted max-w-md text-base text-balance">
          Pick a role, answer out loud, and see exactly what to improve — in your next practice
          session.
        </p>
        <MagneticButton onClick={() => router.push("/interview")}>
          Start a mock interview
        </MagneticButton>
      </div>
    </section>
  );
}
