"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { TranscriptHighlight, type TranscriptPart } from "./transcript-highlight";

const TABS = [
  { key: "before", label: "Your answer" },
  { key: "after", label: "Stronger answer" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function BeforeAfterToggle({
  before,
  after,
}: {
  before: TranscriptPart[];
  after: TranscriptPart[];
}) {
  const [tab, setTab] = useState<TabKey>("before");

  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit gap-1 rounded-[var(--radius-pill)] border border-line bg-surface-2 p-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className="relative rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium"
          >
            {tab === key ? (
              <motion.span
                layoutId="before-after-pill"
                className="absolute inset-0 rounded-[var(--radius-pill)] bg-lime"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            ) : null}
            <span className={cn("relative z-10", tab === key ? "text-lime-ink" : "text-muted")}>
              {label}
            </span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <TranscriptHighlight
            parts={tab === "before" ? before : after}
            className="text-sm leading-relaxed text-text"
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
