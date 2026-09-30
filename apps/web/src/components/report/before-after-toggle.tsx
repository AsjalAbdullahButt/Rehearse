"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import { TranscriptHighlight, type TranscriptPart } from "./transcript-highlight";

type TabKey = "before" | "after";

export function BeforeAfterToggle({
  before,
  after,
  afterLabel = "Stronger answer",
}: {
  before: TranscriptPart[];
  after: TranscriptPart[];
  afterLabel?: string;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  const [tab, setTab] = useState<TabKey>("before");
  const tabs: { key: TabKey; label: string }[] = [
    { key: "before", label: "Your answer" },
    { key: "after", label: afterLabel },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="border-line bg-surface-2 inline-flex max-w-full flex-wrap gap-1 rounded-[var(--radius-pill)] border p-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className="focus-visible:outline-lime relative min-h-11 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {tab === key ? (
              <motion.span
                layoutId={reduce ? undefined : `${id}-before-after-pill`}
                className="bg-lime-fill absolute inset-0 rounded-[var(--radius-pill)]"
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }
                }
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
          transition={{ duration: reduce ? 0 : 0.25 }}
        >
          <TranscriptHighlight
            parts={tab === "before" ? before : after}
            className="text-text text-sm leading-relaxed"
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
