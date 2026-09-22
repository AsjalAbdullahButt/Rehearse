"use client";

import { motion, useReducedMotion } from "motion/react";

import { CountUp } from "@/components/effects/count-up";
import { Card } from "@/components/ui/card";
import { brandEase } from "@/lib/motion";

// Illustrative session data: filler words per session, trending down with practice.
const FILLER_TREND = [9, 8, 7, 6, 6, 4, 3];
const CHART_WIDTH = 480;
const CHART_HEIGHT = 160;
const PADDING = 16;

function buildPath(values: number[]): string {
  const max = Math.max(...values);
  const step = (CHART_WIDTH - PADDING * 2) / (values.length - 1);

  return values
    .map((v, i) => {
      const x = PADDING + i * step;
      const y = PADDING + (1 - v / max) * (CHART_HEIGHT - PADDING * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ProgressSection() {
  const reduce = useReducedMotion();
  const path = buildPath(FILLER_TREND);

  return (
    <section id="progress" className="relative border-t border-line bg-ink py-24">
      <div className="mx-auto max-w-5xl px-6 sm:px-10">
        <div className="mb-12 flex flex-col gap-3 text-center">
          <span className="mx-auto text-xs font-medium uppercase tracking-wide text-muted">
            Progress
          </span>
          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-text sm:text-4xl">
            Watch yourself improve
          </h2>
          <p className="mx-auto max-w-lg text-sm text-muted">
            Every session is tracked — filler words, pace and STAR score, session over session.
          </p>
        </div>

        <Card className="grid gap-8 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Filler words per session
            </span>
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full"
              role="img"
              aria-label="Filler words per session, trending downward from 9 to 3 across seven sessions"
            >
              <motion.path
                d={path}
                fill="none"
                stroke="var(--color-mint)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: reduce ? 0 : 1.4, ease: brandEase }}
              />
            </svg>
          </div>

          <div className="flex flex-row gap-8 lg:flex-col lg:justify-center lg:border-l lg:border-line lg:pl-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Sessions</span>
              <CountUp
                value={7}
                className="font-mono-metric text-2xl tabular-nums text-text"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Avg. pace</span>
              <CountUp
                value={138}
                suffix=" wpm"
                className="font-mono-metric text-2xl tabular-nums text-text"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Avg. score</span>
              <CountUp
                value={7.8}
                decimals={1}
                suffix="/10"
                className="font-mono-metric text-2xl tabular-nums text-mint"
              />
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
