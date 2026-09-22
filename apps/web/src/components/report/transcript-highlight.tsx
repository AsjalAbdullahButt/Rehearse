"use client";

import { motion, useReducedMotion } from "motion/react";

export type TranscriptPart =
  | { type: "text"; text: string }
  | { type: "filler"; text: string }
  | { type: "added"; text: string }
  | { type: "pause"; seconds: number };

export function TranscriptHighlight({
  parts,
  className,
}: {
  parts: TranscriptPart[];
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.type === "filler") {
          return (
            <span key={i} className="underline-filler text-coral">
              {part.text}
            </span>
          );
        }
        if (part.type === "added") {
          return (
            <motion.span
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.15 }}
              className="text-mint"
            >
              {part.text}
            </motion.span>
          );
        }
        if (part.type === "pause") {
          return (
            <span
              key={i}
              className="bg-amber/15 font-mono-metric text-amber mx-1 inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 align-middle text-xs"
            >
              ⏸ {part.seconds.toFixed(1)}s
            </span>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </p>
  );
}
