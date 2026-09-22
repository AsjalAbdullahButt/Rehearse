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
          <span className="font-mono-metric text-muted w-6 text-xs uppercase">{key}</span>
          <div className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-[var(--radius-pill)]">
            <motion.div
              className="bg-violet h-full rounded-[var(--radius-pill)]"
              initial={{ width: 0 }}
              whileInView={{ width: `${(scores[key] / max) * 100}%` }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{
                duration: reduce ? 0 : 0.7,
                ease: brandEase,
                delay: reduce ? 0 : i * 0.08,
              }}
            />
          </div>
          <span className="font-mono-metric text-muted w-10 text-right text-xs tabular-nums">
            {scores[key]}/{max}
          </span>
          <span className="sr-only">{LABELS[key]}</span>
        </div>
      ))}
    </div>
  );
}
