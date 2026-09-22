"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const MAGNETIC_SPRING = { stiffness: 200, damping: 15 };
const MAX_PULL = 6;
const SHIMMER_INTERVAL_MS = 8000;
const SHIMMER_DURATION_MS = 1100;

export function MagneticButton({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const reduce = useReducedMotion();
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");
  const disabled = Boolean(reduce) || isCoarsePointer;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, MAGNETIC_SPRING);
  const springY = useSpring(y, MAGNETIC_SPRING);

  const [shimmering, setShimmering] = useState(false);
  const shimmerTimeout = useRef<number | undefined>(undefined);

  const triggerShimmer = () => {
    if (reduce) return;
    setShimmering(true);
    window.clearTimeout(shimmerTimeout.current);
    shimmerTimeout.current = window.setTimeout(() => setShimmering(false), SHIMMER_DURATION_MS);
  };

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      if (!document.hidden) triggerShimmer();
    }, SHIMMER_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  useEffect(() => () => window.clearTimeout(shimmerTimeout.current), []);

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width - 0.5;
    const relY = (event.clientY - rect.top) / rect.height - 0.5;
    x.set(relX * MAX_PULL * 2);
    y.set(relY * MAX_PULL * 2);
  };

  const handlePointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onHoverStart={triggerShimmer}
      style={disabled ? undefined : { x: springX, y: springY }}
      className={cn(
        "bg-lime text-lime-ink focus-visible:outline-lime relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-[var(--radius-pill)] px-8 py-4 text-base font-medium transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
    >
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      {!reduce ? (
        <span
          aria-hidden="true"
          className="cta-shimmer-sweep pointer-events-none absolute inset-0"
          style={shimmering ? { animation: "shimmer-sweep 1.1s ease-out" } : { opacity: 0 }}
        />
      ) : null}
    </motion.button>
  );
}
