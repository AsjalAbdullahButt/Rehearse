"use client";

import { motion } from "motion/react";

import { BeforeAfterToggle } from "@/components/report/before-after-toggle";
import { ScoreRing } from "@/components/report/score-ring";
import { StarBars } from "@/components/report/star-bars";
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
    <section id="sample-report" className="relative border-t border-line bg-ink py-24">
      <div className="mx-auto max-w-5xl px-6 sm:px-10">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10% 0px" }}
          className="mb-12 flex flex-col gap-3 text-center"
        >
          <span className="mx-auto text-xs font-medium uppercase tracking-wide text-muted">
            Sample report
          </span>
          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-text sm:text-4xl">
            See exactly what to fix
          </h2>
          <p className="mx-auto max-w-lg text-sm text-muted">
            Every answer gets a breakdown like this — filler words, pace, structure, and a
            stronger version to learn from.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10% 0px" }}
        >
          <Card className="grid gap-8 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-6 lg:border-r lg:border-line lg:pr-8">
              <ScoreRing score={7} label="Clarity" />
              <div className="grid grid-cols-3 gap-4 lg:grid-cols-1">
                <Stat label="Filler words" value={4} />
                <Stat label="Pace" value={142} unit="wpm" />
                <Stat label="Long pauses" value={1} />
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                  STAR structure
                </h3>
                <StarBars scores={{ s: 8, t: 7, a: 9, r: 6 }} />
              </div>

              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
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
