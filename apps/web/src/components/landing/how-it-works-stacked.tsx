"use client";

import { motion } from "motion/react";

import { MicOrb } from "@/components/interview/mic-orb";
import { RubricBars } from "@/components/report/rubric-bars";
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
    description:
      "Rehearse transcribes your answer and scores it with a rubric tailored to the question.",
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
          className="border-line bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-6"
        >
          <div className="flex items-baseline gap-3">
            <span className={`font-mono-metric text-sm ${step.color}`}>{step.number}</span>
            <span className="font-display text-text text-xl font-bold">{step.label}</span>
          </div>
          <p className="text-muted text-sm">{step.description}</p>
          {i === 0 ? (
            <div className="flex justify-center py-4">
              <MicOrb size={100} animate={false} />
            </div>
          ) : null}
          {i === 1 ? (
            <RubricBars
              items={[
                { key: "situation", label: "Situation", score: 8 },
                { key: "task", label: "Task", score: 7 },
                { key: "action", label: "Action", score: 9 },
                { key: "result", label: "Result", score: 6 },
              ]}
            />
          ) : null}
          {i === 2 ? (
            <span className="bg-mint/15 text-mint w-fit rounded-[var(--radius-pill)] px-3 py-1 text-xs">
              Clearer structure · Focused feedback
            </span>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
