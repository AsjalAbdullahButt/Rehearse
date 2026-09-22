"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { BeamBorder } from "@/components/effects/beam-border";
import { TiltCard } from "@/components/effects/tilt-card";
import { MicOrb } from "@/components/interview/mic-orb";
import { cn } from "@/lib/utils";

const TRANSCRIPT = "So umm, I'm a final-year CS student who builds AI products end to end…";
const FILLER_REVEAL_AT = TRANSCRIPT.indexOf("umm") + "umm".length;
const START_SECONDS = 65; // 1:05
const END_SECONDS = 90; // 1:30
const TOTAL_SECONDS_CAP = 120; // 2:00
const TYPE_INTERVAL_MS = 85;
const LOOP_PAUSE_MS = 1600;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HeroRecorderCard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { amount: 0.4 });
  const reduce = useReducedMotion();

  const [charsShown, setCharsShown] = useState(reduce ? TRANSCRIPT.length : 0);

  useEffect(() => {
    if (reduce) return;
    if (!inView) return;

    let cancelled = false;
    let timeoutId: number;

    const tick = (index: number) => {
      if (cancelled) return;
      setCharsShown(index);

      if (index >= TRANSCRIPT.length) {
        timeoutId = window.setTimeout(() => tick(0), LOOP_PAUSE_MS);
        return;
      }

      timeoutId = window.setTimeout(() => tick(index + 1), TYPE_INTERVAL_MS);
    };

    tick(0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [inView, reduce]);

  const progress = charsShown / TRANSCRIPT.length;
  const elapsedSeconds = Math.round(START_SECONDS + progress * (END_SECONDS - START_SECONDS));
  const remaining = TOTAL_SECONDS_CAP - elapsedSeconds;
  const fillerCount = charsShown >= FILLER_REVEAL_AT ? 4 : 3;
  const timerTone = remaining <= 10 ? "text-coral" : remaining <= 30 ? "text-amber" : "text-text";

  const typedText = TRANSCRIPT.slice(0, charsShown);
  const fillerStart = TRANSCRIPT.indexOf("umm");
  const fillerEnd = fillerStart + "umm".length;

  return (
    <div ref={containerRef}>
      <TiltCard className="w-full max-w-md overflow-hidden p-6 sm:p-7">
        <BeamBorder />
        <div
          className="relative flex items-center justify-between"
          style={{ transform: "translateZ(20px)" }}
        >
          <span className="text-coral inline-flex items-center gap-1.5 text-xs font-medium">
            <span className="bg-coral size-2 rounded-full" />
            REC
          </span>
          <span className="font-mono-metric text-sm tabular-nums">
            <span className={timerTone}>{formatTime(elapsedSeconds)}</span>
            <span className="text-muted"> / {formatTime(TOTAL_SECONDS_CAP)}</span>
          </span>
        </div>

        <div
          className="relative my-8 flex justify-center"
          style={{ transform: "translateZ(60px)" }}
        >
          <MicOrb size={140} animate={inView && !reduce} />
        </div>

        <div className="relative grid grid-cols-3 gap-3" style={{ transform: "translateZ(40px)" }}>
          <StatTile label="Filler words" value={fillerCount} tone="text-coral" />
          <StatTile label="Pace" value={142} unit="wpm" tone="text-mint" />
          <StatTile label="Long pauses" value={1} tone="text-amber" />
        </div>

        <p
          className="text-muted relative mt-6 min-h-[3.5rem] text-sm leading-relaxed"
          style={{ transform: "translateZ(20px)" }}
        >
          &ldquo;
          {typedText.split("").map((char, i) => {
            const isFiller = i >= fillerStart && i < fillerEnd;
            return (
              <span key={i} className={isFiller ? "underline-filler text-coral" : undefined}>
                {char}
              </span>
            );
          })}
          {charsShown < TRANSCRIPT.length ? (
            <span
              aria-hidden="true"
              className="bg-muted ml-0.5 inline-block h-[1em] w-[2px] animate-[var(--animate-caret-blink)] align-middle"
            />
          ) : (
            "”"
          )}
        </p>
      </TiltCard>
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit?: string;
  tone: string;
}) {
  return (
    <div className="border-line bg-surface-2 rounded-[var(--radius-tile)] border p-3">
      <div className="text-muted text-[11px]">{label}</div>
      <motion.div
        key={value}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={cn("font-mono-metric text-lg tabular-nums", tone)}
      >
        {value}
        {unit ? <span className="text-muted ml-1 text-xs">{unit}</span> : null}
      </motion.div>
    </div>
  );
}
