"use client";

import { motion, useReducedMotion } from "motion/react";

import { brandEase } from "@/lib/motion";

export function ScoreRing({
  score,
  max = 10,
  size = 120,
  strokeWidth = 8,
  label,
}: {
  score: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, score / max));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={label ? `${label}: ${score} out of ${max}` : `Score: ${score} out of ${max}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-mint)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            whileInView={{ strokeDashoffset: circumference * (1 - fraction) }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: reduce ? 0 : 1.1, ease: brandEase }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono-metric text-text text-2xl tabular-nums">
            {score}
            <span className="text-muted text-sm">/{max}</span>
          </span>
        </div>
      </div>
      {label ? <span className="text-muted text-xs">{label}</span> : null}
    </div>
  );
}
