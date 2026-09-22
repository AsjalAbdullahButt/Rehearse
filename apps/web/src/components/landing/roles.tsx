"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";

import { brandEase } from "@/lib/motion";

const ROLES = [
  { slug: "software-engineer", name: "Software Engineer" },
  { slug: "frontend", name: "Frontend" },
  { slug: "backend", name: "Backend" },
  { slug: "data-scientist", name: "Data Scientist" },
  { slug: "ml-engineer", name: "ML Engineer" },
  { slug: "product-manager", name: "Product Manager" },
  { slug: "ui-ux-designer", name: "UI/UX Designer" },
  { slug: "hr-general", name: "HR / General" },
] as const;

const tiltUp: Variants = {
  hidden: { opacity: 0, y: 40, rotateX: 12 },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: 0.6, ease: brandEase },
  },
};

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export function Roles() {
  const reduce = useReducedMotion();

  return (
    <section id="roles" className="relative border-t border-line bg-ink py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <div className="mb-12 flex flex-col gap-3 text-center">
          <span className="mx-auto text-xs font-medium uppercase tracking-wide text-muted">
            Question bank
          </span>
          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-text sm:text-4xl">
            Pick a role to start
          </h2>
          <p className="mx-auto max-w-lg text-sm text-muted">
            Every role has its own bank of behavioral, technical and situational questions.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10% 0px" }}
          style={{ perspective: 1000 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {ROLES.map((role) => (
            <motion.div
              key={role.slug}
              variants={reduce ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : tiltUp}
              className="group relative overflow-hidden rounded-[var(--radius-tile)] border border-line bg-surface p-5 transition-colors duration-150 hover:border-lime/40"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-px rounded-[var(--radius-tile)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(160px circle at 50% 0%, color-mix(in oklab, var(--color-lime) 18%, transparent), transparent 70%)",
                }}
              />
              <span className="relative text-sm font-medium text-text">{role.name}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
