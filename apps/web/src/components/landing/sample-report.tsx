"use client";

import { motion } from "motion/react";

import { BeforeAfterToggle } from "@/components/report/before-after-toggle";
import { RubricBars } from "@/components/report/rubric-bars";
import { ScoreRing } from "@/components/report/score-ring";
import type { TranscriptPart } from "@/components/report/transcript-highlight";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { fadeUp } from "@/lib/motion";

const BEFORE_PARTS: TranscriptPart[] = [
  { type: "text", text: "So " },
  { type: "filler", text: "umm" },
  { type: "text", text: ", I'm a final-year CS student who builds AI products end to end. " },
  { type: "filler", text: "Um" },
  { type: "text", text: ", I guess my biggest project was, " },
  { type: "filler", text: "like" },
  { type: "text", text: ", a recommendation engine I built for" },
  { type: "pause", seconds: 2.4 },
  { type: "text", text: "a retail client, and it " },
  { type: "filler", text: "um" },
  { type: "text", text: " worked pretty well I think." },
];

const AFTER_PARTS: TranscriptPart[] = [
  { type: "text", text: "I'm a final-year CS student " },
  { type: "added", text: "who's shipped three AI products end to end" },
  { type: "text", text: ". My biggest project was a recommendation engine for a retail client — " },
  { type: "added", text: "I owned it from data pipeline to deployed UI" },
  { type: "text", text: ", and it " },
  { type: "added", text: "lifted click-through rate by 18% in the first month" },
  { type: "text", text: "." },
];

export function SampleReport() {
  return (
    <section id="sample-report" className="border-line bg-ink relative border-t py-24">
      <div className="mx-auto max-w-5xl px-6 sm:px-10">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10% 0px" }}
          className="mb-12 flex flex-col gap-3 text-center"
        >
          <span className="text-muted mx-auto text-xs font-medium tracking-wide uppercase">
            Sample report
          </span>
          <h2 className="font-display text-text text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            See exactly what to fix
          </h2>
          <p className="text-muted mx-auto max-w-lg text-sm">
            Every answer gets a breakdown like this — filler words, pace, structure, and a stronger
            version to learn from.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10% 0px" }}
        >
          <Card className="grid gap-8 lg:grid-cols-[auto_1fr]">
            <div className="lg:border-line flex flex-col items-center gap-6 lg:border-r lg:pr-8">
              <ScoreRing score={7} label="Clarity" />
              <div className="grid grid-cols-3 gap-4 lg:grid-cols-1">
                <Stat label="Filler words" value={4} />
                <Stat label="Pace" value={142} unit="wpm" />
                <Stat label="Long pauses" value={1} />
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div>
                <h3 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                  STAR structure
                </h3>
                <RubricBars
                  items={[
                    { key: "situation", label: "Situation", score: 8 },
                    { key: "task", label: "Task", score: 7 },
                    { key: "action", label: "Action", score: 9 },
                    { key: "result", label: "Result", score: 6 },
                  ]}
                />
              </div>

              <div>
                <h3 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                  Answer
                </h3>
                <BeforeAfterToggle before={BEFORE_PARTS} after={AFTER_PARTS} />
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
