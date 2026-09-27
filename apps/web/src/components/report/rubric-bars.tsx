"use client";

import { motion, useReducedMotion } from "motion/react";

import { brandEase } from "@/lib/motion";
import { clampFraction } from "@/lib/utils";

export interface RubricBarItem {
  key: string;
  label: string;
  score: number;
}

/** Renders whichever rubric fields the caller passes in — generic over behavioral/technical/
 * situational so this component never hardcodes STAR (or any other category's) labels. See
 * lib/interview/rubric-insights.ts's rubricAreas() for building this list from a Rubric. */
export function RubricBars({ items, max = 10 }: { items: RubricBarItem[]; max?: number }) {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const fraction = clampFraction(item.score, max);
        return (
          <div key={item.key} className="flex items-center gap-3">
            <span className="text-muted w-28 shrink-0 text-xs">{item.label}</span>
            <div className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-[var(--radius-pill)]">
              <motion.div
                className="bg-violet h-full rounded-[var(--radius-pill)]"
                initial={{ width: 0 }}
                whileInView={{ width: `${fraction * 100}%` }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{
                  duration: reduce ? 0 : 0.7,
                  ease: brandEase,
                  delay: reduce ? 0 : i * 0.08,
                }}
              />
            </div>
            <span className="font-mono-metric text-muted w-10 text-right text-xs tabular-nums">
              {item.score}/{max}
            </span>
          </div>
        );
      })}
    </div>
  );
}
