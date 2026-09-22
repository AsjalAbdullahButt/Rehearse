"use client";

import { useInView, useMotionValue, useReducedMotion, useTransform, animate } from "motion/react";
import { useEffect, useRef, useState } from "react";

export function CountUp({
  value,
  duration = 1.2,
  decimals = 0,
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => v.toFixed(decimals));
  const [display, setDisplay] = useState((0).toFixed(decimals));

  useEffect(() => {
    if (!inView) return;

    // Routed through the motionValue's own change event, never a direct setState call here.
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));

    if (reduce) {
      motionValue.set(value);
      return unsubscribe;
    }

    const controls = animate(motionValue, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [inView, reduce, value, duration, decimals, motionValue, rounded]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
}
