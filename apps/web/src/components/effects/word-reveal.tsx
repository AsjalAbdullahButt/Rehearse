"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";

import { brandEase } from "@/lib/motion";

const container: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

const word: Variants = {
  hidden: { opacity: 0, y: 20, rotateX: -40, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: brandEase },
  },
};

const wordReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, ease: brandEase } },
};

export function WordReveal({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  return (
    <motion.h1
      className={className}
      style={{ perspective: 600 }}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          variants={reduce ? wordReduced : word}
          className="inline-block will-change-transform"
          style={{ transformStyle: "preserve-3d" }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </motion.h1>
  );
}
