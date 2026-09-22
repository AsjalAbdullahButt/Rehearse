"use client";

import { motion } from "motion/react";

import { MicOrb } from "@/components/interview/mic-orb";
import { StarBars } from "@/components/report/star-bars";
import { fadeUp } from "@/lib/motion";

const STEPS = [
  {
    number: "01",
    label: "Speak",
    color: "text-lime",
    description: "Answer a role-specific question out loud, just like the real thing.",
  },
  {
    number: "02",
    label: "Analyze",
    color: "text-violet",
    description: "Rehearse transcribes your answer and scores its STAR structure.",
  },
  {
    number: "03",
    label: "Improve",
    color: "text-mint",
    description: "See exactly what to cut, and a stronger sample answer to learn from.",
  },
] as const;

export function HowItWorksStacked() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-20 sm:px-10">
      {STEPS.map((step, i) => (
        <motion.div
          key={step.number}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10% 0px" }}
          className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6"
        >
          <div className="flex items-baseline gap-3">
            <span className={`font-mono-metric text-sm ${step.color}`}>{step.number}</span>
            <span className="font-display text-xl font-bold text-text">{step.label}</span>
          </div>
          <p className="text-sm text-muted">{step.description}</p>
          {i === 0 ? (
            <div className="flex justify-center py-4">
              <MicOrb size={100} animate={false} />
            </div>
          ) : null}
          {i === 1 ? <StarBars scores={{ s: 8, t: 7, a: 9, r: 6 }} /> : null}
          {i === 2 ? (
            <span className="w-fit rounded-[var(--radius-pill)] bg-mint/15 px-3 py-1 text-xs text-mint">
              Fillers removed · STAR structure added
            </span>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
