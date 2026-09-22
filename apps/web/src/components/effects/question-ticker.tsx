"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { brandEase } from "@/lib/motion";

const QUESTIONS = [
  "Tell me about yourself.",
  "Why do you want this role?",
  "Describe a conflict you solved.",
  "What's your biggest weakness?",
];

// The first question is repeated at the end so the slide can advance straight
// through it, then snap back to index 0 without animating — no reverse scroll.
const SLIDES = [...QUESTIONS, QUESTIONS[0]];

const INTERVAL_MS = 2800;
const SLIDE_TRANSITION = { duration: 0.5, ease: brandEase };

export function QuestionTicker({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [instant, setInstant] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);

  useEffect(() => {
    if (itemRef.current) setLineHeight(itemRef.current.offsetHeight);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((i) => i + 1);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (index !== SLIDES.length - 1) return;
    const delay = reduce ? 0 : SLIDE_TRANSITION.duration * 1000;
    const timeout = window.setTimeout(() => {
      setInstant(true);
      setIndex(0);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [index, reduce]);

  useEffect(() => {
    if (!instant) return;
    const frame = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(frame);
  }, [instant]);

  return (
    <div className={className} style={{ height: lineHeight || undefined, overflow: "hidden" }}>
      <motion.div
        animate={{ y: -index * lineHeight }}
        transition={instant || reduce ? { duration: 0 } : SLIDE_TRANSITION}
      >
        {SLIDES.map((question, i) => (
          <div
            key={`${question}-${i}`}
            ref={i === 0 ? itemRef : undefined}
            className="flex items-baseline whitespace-nowrap"
          >
            <span className="font-mono-metric text-lime">&ldquo;{question}&rdquo;</span>
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-[1em] w-[2px] animate-[var(--animate-caret-blink)] bg-lime align-middle"
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
