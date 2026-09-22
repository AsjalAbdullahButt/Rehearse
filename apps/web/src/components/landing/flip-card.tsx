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
          className="border-line bg-surface absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] border p-8"
        >
          <span className="text-muted text-xs font-medium">Recording your answer</span>
          <MicOrb size={110} animate />
          <span className="font-mono-metric text-muted text-sm tabular-nums">0:42 / 2:00</span>
        </div>

        {/* Back face — Analyze → Improve */}
        <div
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          className="border-line bg-surface absolute inset-0 overflow-hidden rounded-[var(--radius-card)] border p-8"
        >
          <motion.div
            style={{ opacity: analyzeOpacity }}
            className="absolute inset-0 flex flex-col justify-center gap-5 p-8"
          >
            <span className="text-muted text-xs font-medium">Analyzing your STAR structure</span>
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
            <span className="text-mint text-xs font-medium">Stronger answer ready</span>
            <p className="text-text text-sm leading-relaxed">
              &ldquo;I&apos;m a final-year CS student who has shipped three AI products end to end,
              from data pipeline to deployed UI.&rdquo;
            </p>
            <span className="bg-mint/15 text-mint w-fit rounded-[var(--radius-pill)] px-3 py-1 text-xs">
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
          <span className="font-mono-metric text-muted w-4 text-[11px] uppercase">{key}</span>
          <div className="bg-surface-2 h-1.5 flex-1 overflow-hidden rounded-[var(--radius-pill)]">
            <motion.div
              className="bg-violet h-full rounded-[var(--radius-pill)]"
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
    <div className="border-line bg-surface-2 rounded-[var(--radius-tile)] border p-2.5 text-center">
      <div className="text-muted text-[10px]">{label}</div>
      <div className={`font-mono-metric text-sm tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
