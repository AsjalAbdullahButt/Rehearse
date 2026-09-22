"use client";

import { motion, useTransform, type MotionValue } from "motion/react";

const STEPS = [
  { key: "speak", number: "01", label: "Speak", color: "var(--color-lime)", range: [0, 0.33] },
  { key: "analyze", number: "02", label: "Analyze", color: "var(--color-violet)", range: [0.33, 0.66] },
  { key: "improve", number: "03", label: "Improve", color: "var(--color-mint)", range: [0.66, 1] },
] as const;

export function StepRail({ progress }: { progress: MotionValue<number> }) {
  const railScale = useTransform(progress, [0, 1], [0, 1]);

  return (
    <div className="relative flex flex-col justify-center gap-10 pl-8">
      <div className="absolute inset-y-0 left-0 w-px bg-line">
        <motion.div
          className="w-full origin-top bg-gradient-to-b from-lime via-violet to-mint"
          style={{ scaleY: railScale, height: "100%" }}
        />
      </div>

      {STEPS.map((step) => (
        <StepLabel key={step.key} step={step} progress={progress} />
      ))}
    </div>
  );
}

function StepLabel({
  step,
  progress,
}: {
  step: (typeof STEPS)[number];
  progress: MotionValue<number>;
}) {
  const [start, end] = step.range;
  const pad = (end - start) * 0.12;

  // Compute all three shapes unconditionally (stable hook call order), then pick one.
  const firstOpacity = useTransform(progress, [start, end - pad, end], [1, 1, 0.4]);
  const lastOpacity = useTransform(progress, [start, start + pad, end], [0.4, 1, 1]);
  const middleOpacity = useTransform(
    progress,
    [start, start + pad, end - pad, end],
    [0.4, 1, 1, 0.4],
  );
  const opacity = start === 0 ? firstOpacity : end === 1 ? lastOpacity : middleOpacity;

  return (
    <motion.div style={{ opacity }} className="flex items-baseline gap-3">
      <span className="font-mono-metric text-sm" style={{ color: step.color }}>
        {step.number}
      </span>
      <span className="font-display text-2xl font-bold text-text">{step.label}</span>
    </motion.div>
  );
}
