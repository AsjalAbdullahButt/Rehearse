"use client";

import { useEffect, useRef } from "react";

const BAR_COUNT = 5;

/** Real mic input, not the canned animation MicOrb uses on the landing page — reads live
 * frequency data from the recorder's AnalyserNode every frame and drives bar heights via
 * direct style writes (not React state) so this can run at animation-frame rate without
 * re-rendering the component 60 times a second. */
export function Waveform({ analyser }: { analyser: AnalyserNode | null }) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
    let frameId: number;

    const tick = () => {
      analyser.getByteFrequencyData(data);

      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = i * step; j < (i + 1) * step; j++) {
          sum += data[j] ?? 0;
        }
        const average = sum / step / 255;
        const scale = 0.15 + average * 0.85;
        const bar = barRefs.current[i];
        if (bar) {
          bar.style.transform = `scaleY(${scale})`;
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [analyser]);

  return (
    <div className="flex h-10 items-end justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <div
          key={index}
          ref={(el) => {
            barRefs.current[index] = el;
          }}
          className="bg-lime h-full w-1.5 origin-bottom rounded-full transition-transform duration-75 ease-out"
        />
      ))}
    </div>
  );
}
