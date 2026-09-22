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
  className,
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const isAnimating = animate && !reduce;

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
        className="relative z-10 flex items-center justify-center rounded-full bg-lime shadow-[0_0_60px_rgba(212,255,90,0.35)]"
        style={orbStyle}
      >
        <div className="flex items-center gap-[3px]" aria-hidden="true">
          {BAR_HEIGHTS.map((h, i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-lime-ink"
              style={{ height: size * 0.32 * h }}
              animate={
                isAnimating
                  ? { scaleY: [0.4, 1, 0.6, h + 0.2, 0.4] }
                  : { scaleY: h }
              }
              transition={
                isAnimating
                  ? { duration: 1.1, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }
                  : { duration: 0 }
              }
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
