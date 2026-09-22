"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { PointerEvent, ReactNode } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const TILT_SPRING = { stiffness: 150, damping: 18, mass: 0.6 };

export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");
  const disabled = Boolean(reduce) || isCoarsePointer;

  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [8, -8]), TILT_SPRING);
  const rotateY = useSpring(useTransform(mx, [0, 1], [-8, 8]), TILT_SPRING);
  const glareX = useTransform(mx, (v) => `${v * 100}%`);
  const glareY = useTransform(my, (v) => `${v * 100}%`);
  const glareBackground = useTransform(
    [glareX, glareY],
    ([x, y]) =>
      `radial-gradient(420px circle at ${x} ${y}, rgba(255,255,255,0.12), transparent 60%)`,
  );

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - rect.left) / rect.width);
    my.set((event.clientY - rect.top) / rect.height);
  };

  const handlePointerLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <div style={{ perspective: disabled ? undefined : 1200 }}>
      <motion.div
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={disabled ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" as const }}
        className={cn(
          "border-line bg-surface relative rounded-[var(--radius-card)] border",
          className,
        )}
      >
        {children}
        {!disabled ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] mix-blend-overlay"
            style={{ background: glareBackground }}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
