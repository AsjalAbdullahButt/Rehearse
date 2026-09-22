"use client";

import { useScroll } from "motion/react";
import { useRef } from "react";

import { FlipCard } from "@/components/landing/flip-card";
import { HowItWorksStacked } from "@/components/landing/how-it-works-stacked";
import { StepRail } from "@/components/landing/step-rail";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const reduced = useReducedMotionSafe();
  const usePinnedStory = isDesktop && !reduced;

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className={usePinnedStory ? "relative h-[300vh]" : "relative"}
    >
      {usePinnedStory ? (
        <div className="bg-ink sticky top-0 flex h-screen items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,280px)_1fr] items-center gap-16 px-6 sm:px-10">
            <StepRail progress={scrollYProgress} />
            <FlipCard progress={scrollYProgress} />
          </div>
        </div>
      ) : (
        <HowItWorksStacked />
      )}
    </section>
  );
}
