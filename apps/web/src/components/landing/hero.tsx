"use client";

import { Aurora } from "@/components/effects/aurora";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { QuestionTicker } from "@/components/effects/question-ticker";
import { WordReveal } from "@/components/effects/word-reveal";
import { HeroRecorderCard } from "@/components/landing/hero-recorder-card";
import { useSmoothScrollTo } from "@/hooks/use-smooth-scroll-to";

export function Hero() {
  const scrollTo = useSmoothScrollTo();

  return (
    <section id="top" className="bg-dot-grid relative overflow-hidden">
      <Aurora className="opacity-70" />
      <div className="relative mx-auto grid max-w-6xl gap-16 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-32">
        <div className="flex flex-col gap-6">
          <span className="border-line bg-surface text-muted inline-flex w-fit items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2 text-xs">
            <span className="bg-coral size-1.5 rounded-full" />
            Speak out loud. Get honest feedback in seconds.
          </span>

          <WordReveal
            text="Answer like you've done this before."
            className="font-display text-text text-[clamp(44px,7vw,84px)] leading-[1.02] font-bold tracking-[-0.035em] text-balance"
          />

          <div className="font-mono-metric text-muted flex items-baseline gap-2 text-sm">
            <span>Next question:</span>
            <QuestionTicker />
          </div>

          <p className="text-muted max-w-md text-base text-balance">
            Rehearse listens to your answer, flags rambling, filler words and unclear points, then
            shows you a stronger version to learn from.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <MagneticButton onClick={() => scrollTo("#roles")}>
              <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
                <path
                  d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.93V21h2v-2.07A7 7 0 0019 12h-2z"
                  fill="currentColor"
                />
              </svg>
              Start a mock interview
            </MagneticButton>
            <button
              type="button"
              onClick={() => scrollTo("#sample-report")}
              className="border-line bg-surface text-text hover:bg-surface-2 focus-visible:outline-lime inline-flex h-[52px] items-center justify-center rounded-[var(--radius-pill)] border px-8 text-base font-medium transition-colors duration-150 ease-[var(--ease-brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              See a sample report
            </button>
          </div>

          <p className="text-muted pt-4 text-xs">
            Role-specific questions · AI interviewer voice · Progress tracking
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <HeroRecorderCard />
        </div>
      </div>
    </section>
  );
}
