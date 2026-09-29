"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useCountdown } from "@/hooks/use-countdown";
import type { SessionQuestion, SessionStatus } from "@/lib/interview/types";

const AUTO_ADVANCE_DELAY_S = 8;

function autoAdvanceStorageKey(sessionId: string): string {
  return `rehearse:auto-advance:${sessionId}`;
}

function readAutoAdvancePreference(sessionId: string): boolean {
  try {
    return localStorage.getItem(autoAdvanceStorageKey(sessionId)) === "true";
  } catch {
    // Private browsing / storage disabled — treated the same as "never set".
    return false;
  }
}

/** The persisted per-session "auto-advance" preference, as a real external store rather than a
 * useState seeded from an effect — the same "genuinely unknown until hydration" problem
 * use-has-mounted.ts solves for next-themes' theme, but this one is also user-writable, so it
 * needs actual subscribe/notify wiring rather than a one-shot client/server snapshot pair.
 * getSnapshot re-reads localStorage fresh each call (cheap and synchronous); setPreference
 * writes through and then notifies this hook's own subscriber, which is what makes the write
 * show up immediately without ever calling setState from inside an effect body. */
function useAutoAdvancePreference(sessionId: string): [boolean, (next: boolean) => void] {
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((onStoreChange: () => void) => {
    const listeners = listenersRef.current;
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }, []);
  const getSnapshot = useCallback(() => readAutoAdvancePreference(sessionId), [sessionId]);
  const getServerSnapshot = useCallback(() => false, []);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPreference = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(autoAdvanceStorageKey(sessionId), String(next));
      } catch {
        // The toggle still visibly flips for this page view; it just won't persist.
      }
      for (const listener of listenersRef.current) listener();
    },
    [sessionId],
  );

  return [value, setPreference];
}

/** What happens after a single question's report — "continue", "end here", or (opt-in)
 * "continue automatically". Split out as its own client component because the report page
 * itself is a Server Component; this is the one part of it that needs interactivity
 * (localStorage, a countdown, a confirm step). */
export function ReportNextSteps({
  sessionId,
  questionNumber,
  questionCount,
  sessionStatus,
  nextQuestion,
}: {
  sessionId: string;
  questionNumber: number;
  questionCount: number;
  sessionStatus: SessionStatus;
  nextQuestion: SessionQuestion | null;
}) {
  const router = useRouter();
  const isSessionOver = sessionStatus === "completed" || !nextQuestion;

  const [autoAdvance, setAutoAdvance] = useAutoAdvancePreference(sessionId);
  const [isEndingConfirm, setIsEndingConfirm] = useState(false);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const hasStartedCountdownRef = useRef(false);

  // Reuses the same countdown hook the live recording cap already uses — one setInterval, not a
  // hand-rolled chain of setTimeouts, ticking down and firing once at 0.
  const secondsLeft = useCountdown(AUTO_ADVANCE_DELAY_S, isCountdownActive, () => {
    router.push(`/interview?session=${sessionId}`);
  });

  // The countdown only starts once this section actually scrolls into view, not the instant the
  // page loads — a report has a lot to read above it (score, transcript, strengths, ...), and
  // "auto-advance" should mean "once I've reached the end", not "yank me away mid-read". Fires
  // at most once per page view even if the section scrolls in and out again.
  useEffect(() => {
    if (!autoAdvance || isSessionOver || hasStartedCountdownRef.current) return;
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasStartedCountdownRef.current) {
          hasStartedCountdownRef.current = true;
          setIsCountdownActive(true);
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [autoAdvance, isSessionOver]);

  function toggleAutoAdvance(next: boolean) {
    setAutoAdvance(next);
    if (!next) setIsCountdownActive(false);
  }

  if (isSessionOver) {
    return (
      <div className="border-line flex flex-col items-center gap-3 border-t pt-6 text-center">
        <p className="text-muted text-sm">That was the last question — your session is complete.</p>
        <Button onClick={() => router.push(`/session/${sessionId}/summary`)}>
          View session summary
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={sectionRef}
      className="border-line flex flex-col items-center gap-4 border-t pt-6 text-center"
    >
      <p className="text-muted text-sm">
        Question {questionNumber} of {questionCount} complete.
      </p>

      {isCountdownActive ? (
        <p className="text-muted text-xs" aria-live="polite" role="status">
          Continuing to question {questionNumber + 1} in {secondsLeft}s ·{" "}
          <button
            type="button"
            onClick={() => setIsCountdownActive(false)}
            className="text-lime hover:underline"
          >
            Stay on this report
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => router.push(`/interview?session=${sessionId}`)}>
          Continue interview — Question {questionNumber + 1} of {questionCount}
        </Button>

        {isEndingConfirm ? (
          <>
            <span className="text-muted text-xs">
              End here? You can see how you did so far — nothing you&apos;ve answered is lost.
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/session/${sessionId}/summary`)}
            >
              Yes, end it here
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsEndingConfirm(false)}>
              Keep going
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setIsEndingConfirm(true)}>
            End interview here
          </Button>
        )}
      </div>

      <label className="text-muted flex items-center gap-2 text-xs">
        <Toggle
          pressed={autoAdvance}
          onPressedChange={toggleAutoAdvance}
          label="Automatically continue to the next question"
        />
        Automatically continue to the next question
      </label>
    </div>
  );
}
