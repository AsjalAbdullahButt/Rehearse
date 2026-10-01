"use client";

import { useCallback, useEffect, useState } from "react";

import { ProsodyAccumulator, type ProsodySummary } from "@/lib/audio/prosody";

const SAMPLE_INTERVAL_MS = 50;

/** Measures pitch/energy/volume from the live microphone signal while `analyser` exists, and
 * keeps only a running set of statistics — no audio is stored. The statistics restart whenever a
 * new analyser appears (a new recording) and stay readable after the recording ends, which is
 * when the answer is submitted. */
export function useProsodyCapture(analyser: AnalyserNode | null): {
  getSummary: () => ProsodySummary | null;
} {
  const [accumulator] = useState(() => new ProsodyAccumulator());

  useEffect(() => {
    if (!analyser) return;
    accumulator.reset();
    const buffer = new Float32Array(analyser.fftSize);
    const sampleRate = analyser.context.sampleRate;
    const id = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      accumulator.addFrame(buffer, sampleRate);
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [analyser, accumulator]);

  const getSummary = useCallback(() => accumulator.summary(), [accumulator]);
  return { getSummary };
}
