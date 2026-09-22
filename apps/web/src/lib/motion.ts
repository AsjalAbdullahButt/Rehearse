import type { Transition, Variants } from "motion/react";

/** Shared brand easing curve — used for nearly all UI motion. */
export const brandEase = [0.16, 1, 0.3, 1] as const;

export const duration = {
  micro: 0.15,
  ui: 0.3,
  reveal: 0.8,
} as const;

export const springs = {
  tilt: { type: "spring", stiffness: 150, damping: 18 } as const,
  pop: { type: "spring", stiffness: 300, damping: 20 } as const,
  magnetic: { type: "spring", stiffness: 200, damping: 15 } as const,
} as const;

export const transitions = {
  micro: { duration: duration.micro, ease: brandEase } satisfies Transition,
  ui: { duration: duration.ui, ease: brandEase } satisfies Transition,
  reveal: { duration: duration.reveal, ease: brandEase } satisfies Transition,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: transitions.reveal },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitions.reveal },
};

export const staggerChildren = (stagger = 0.06): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger,
    },
  },
});
