"use client";

import { motion, useTransform, type MotionValue } from "motion/react";

import { MicOrb } from "@/components/interview/mic-orb";

export function FlipCard({ progress }: { progress: MotionValue<number> }) {
  const rotateY = useTransform(progress, [0, 0.33, 0.66, 1], [0, 0, 180, 180]);
  const scale = useTransform(progress, [0.66, 0.82, 1], [1, 1.03, 1.03]);
  const starFill = useTransform(progress, [0.33, 0.64], [0, 1]);
  const analyzeOpacity = useTransform(progress, [0.66, 0.8], [1, 0]);
  const improveOpacity = useTransform(progress, [0.72, 0.88], [0, 1]);

  return (
    <div style={{ perspective: 1600 }} className="flex items-center justify-center">
      <motion.div
        style={{ rotateY, scale, transformStyle: "preserve-3d" }}
        className="relative aspect-[4/3] w-full max-w-md"
      >
        {/* Front face — Speak */}
        <div
          style={{ backfaceVisibility: "hidden" }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-8"
        >
          <span className="text-xs font-medium text-muted">Recording your answer</span>
          <MicOrb size={110} animate />
          <span className="font-mono-metric text-sm tabular-nums text-muted">0:42 / 2:00</span>
        </div>

        {/* Back face — Analyze → Improve */}
        <div
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          className="absolute inset-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-8"
        >
          <motion.div style={{ opacity: analyzeOpacity }} className="absolute inset-0 flex flex-col justify-center gap-5 p-8">
            <span className="text-xs font-medium text-muted">Analyzing your STAR structure</span>
            <StarBarsScrollLinked fill={starFill} />
            <div className="grid grid-cols-3 gap-3 pt-2">
              <MiniStat label="Filler" value="4" tone="text-coral" />
              <MiniStat label="Pace" value="142" tone="text-mint" />
              <MiniStat label="Pauses" value="1" tone="text-amber" />
            </div>
          </motion.div>

          <motion.div
            style={{ opacity: improveOpacity }}
            className="absolute inset-0 flex flex-col justify-center gap-3 p-8"
          >
            <span className="text-xs font-medium text-mint">Stronger answer ready</span>
            <p className="text-sm leading-relaxed text-text">
              &ldquo;I&apos;m a final-year CS student who has shipped three AI products end to
              end, from data pipeline to deployed UI.&rdquo;
            </p>
            <span className="w-fit rounded-[var(--radius-pill)] bg-mint/15 px-3 py-1 text-xs text-mint">
              Fillers removed · STAR structure added
            </span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function StarBarsScrollLinked({ fill }: { fill: MotionValue<number> }) {
  const target = { s: 8, t: 7, a: 9, r: 6 };
  return (
    <div className="flex flex-col gap-2.5">
      {(Object.keys(target) as Array<keyof typeof target>).map((key) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-4 font-mono-metric text-[11px] uppercase text-muted">{key}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-surface-2">
            <motion.div
              className="h-full rounded-[var(--radius-pill)] bg-violet"
              style={{ scaleX: fill, transformOrigin: "left" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[var(--radius-tile)] border border-line bg-surface-2 p-2.5 text-center">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={`font-mono-metric text-sm tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
