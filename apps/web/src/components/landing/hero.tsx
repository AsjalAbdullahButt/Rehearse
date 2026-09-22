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
    <section id="top" className="relative overflow-hidden bg-dot-grid">
      <Aurora className="opacity-70" />
      <div className="relative mx-auto grid max-w-6xl gap-16 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-32">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-surface px-4 py-2 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-coral" />
            Speak out loud. Get honest feedback in seconds.
          </span>

          <WordReveal
            text="Answer like you've done this before."
            className="text-balance font-display text-[clamp(44px,7vw,84px)] font-bold leading-[1.02] tracking-[-0.035em] text-text"
          />

          <div className="flex items-baseline gap-2 font-mono-metric text-sm text-muted">
            <span>Next question:</span>
            <QuestionTicker />
          </div>

          <p className="max-w-md text-balance text-base text-muted">
            Rehearse listens to your answer, flags rambling, filler words and unclear points,
            then shows you a stronger version to learn from.
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
              className="inline-flex h-[52px] items-center justify-center rounded-[var(--radius-pill)] border border-line bg-surface px-8 text-base font-medium text-text transition-colors duration-150 ease-[var(--ease-brand)] hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              See a sample report
            </button>
          </div>

          <p className="pt-4 text-xs text-muted">
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
