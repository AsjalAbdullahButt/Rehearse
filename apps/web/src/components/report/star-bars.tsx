"use client";

import { motion, useReducedMotion } from "motion/react";

import { brandEase } from "@/lib/motion";

const LABELS = {
  s: "Situation",
  t: "Task",
  a: "Action",
  r: "Result",
} as const;

export interface StarScore {
  s: number;
  t: number;
  a: number;
  r: number;
}

export function StarBars({ scores, max = 10 }: { scores: StarScore; max?: number }) {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col gap-3">
      {(Object.keys(LABELS) as Array<keyof StarScore>).map((key, i) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-6 font-mono-metric text-xs uppercase text-muted">{key}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-surface-2">
            <motion.div
              className="h-full rounded-[var(--radius-pill)] bg-violet"
              initial={{ width: 0 }}
              whileInView={{ width: `${(scores[key] / max) * 100}%` }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: reduce ? 0 : 0.7, ease: brandEase, delay: reduce ? 0 : i * 0.08 }}
            />
          </div>
          <span className="w-10 text-right font-mono-metric text-xs tabular-nums text-muted">
            {scores[key]}/{max}
          </span>
          <span className="sr-only">{LABELS[key]}</span>
        </div>
      ))}
    </div>
  );
}
