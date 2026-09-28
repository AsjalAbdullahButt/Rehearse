"use client";

import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";

import { RippleRings } from "@/components/effects/ripple-rings";
import { cn } from "@/lib/utils";

/** `viewTransitionName` isn't in React's bundled CSS typings yet; extend locally. */
type OrbStyle = CSSProperties & { viewTransitionName?: string };

const BAR_HEIGHTS = [0.45, 0.85, 0.6, 1, 0.5];

export function MicOrb({
  size = 140,
  animate = true,
  recording = false,
  voiceActive,
  className,
}: {
  size?: number;
  animate?: boolean;
  /** Swaps the orb from lime (idle/ambient) to coral (live recording). Defaults to false, so
   * the landing page's decorative usage is unaffected. */
  recording?: boolean;
  /** When provided (meaningful only alongside `recording`), the bars track real voice activity
   * instead of the ambient decorative loop below: a quicker, livelier pulse while `true`,
   * settling to a near-flat line while `false` — so the orb reads as "listening to you" rather
   * than "just busy", and a silent mic is visible immediately instead of looking identical to a
   * working one. Left `undefined` everywhere else (the landing page's purely decorative usage,
   * the mic-check step, the "analyzing" spinner), which keeps the original always-looping
   * animation exactly as it was. */
  voiceActive?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const isAnimating = animate && !reduce;
  const isVoiceReactive = recording && voiceActive !== undefined && isAnimating;

  const orbStyle: OrbStyle = {
    width: size * 0.72,
    height: size * 0.72,
    viewTransitionName: "mic-orb",
  };

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {isAnimating ? <RippleRings /> : null}
      <motion.div
        layoutId="mic-orb"
        className={cn(
          "relative z-10 flex items-center justify-center rounded-full",
          recording
            ? "bg-coral shadow-[0_0_60px_rgba(255,90,78,0.35)]"
            : "bg-lime shadow-[0_0_60px_rgba(212,255,90,0.35)]",
        )}
        style={orbStyle}
      >
        <div className="flex items-center gap-[3px]" aria-hidden="true">
          {BAR_HEIGHTS.map((h, i) => {
            const animateProp = isVoiceReactive
              ? voiceActive
                ? { scaleY: [0.5, 1, 0.6, h + 0.3, 0.5] }
                : { scaleY: 0.25 }
              : isAnimating
                ? { scaleY: [0.4, 1, 0.6, h + 0.2, 0.4] }
                : { scaleY: h };
            const transitionProp = isVoiceReactive
              ? voiceActive
                ? { duration: 0.6, repeat: Infinity, delay: i * 0.05, ease: "easeInOut" as const }
                : { duration: 0.2 }
              : isAnimating
                ? { duration: 1.1, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" as const }
                : { duration: 0 };
            return (
              <motion.span
                key={i}
                className={cn("w-[3px] rounded-full", recording ? "bg-ink" : "bg-lime-ink")}
                style={{ height: size * 0.32 * h }}
                animate={animateProp}
                transition={transitionProp}
              />
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
