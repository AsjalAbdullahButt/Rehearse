"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SILENCE_NUDGE_MS = 7000; // within the 5-8s window a real interviewer would wait
const RENUDGE_COOLDOWN_MS = 15000; // don't nag every 7s — only if they're still quiet later

export interface SilenceNudge {
  /** Restarts the silence countdown — call after speaking the question again, so the person
   * gets a fresh window to answer instead of being nudged again almost immediately. */
  reset: () => void;
}

/** Fires `onSilence` once continuous silence (per `isSpeaking`, from use-voice-activity.ts) has
 * lasted SILENCE_NUDGE_MS, and again every RENUDGE_COOLDOWN_MS after that if still silent —
 * resetting the instant `isSpeaking` goes true, so answering at all cancels it, the same way a
 * real interviewer stops waiting once you start talking. */
export function useSilenceNudge(
  isSpeaking: boolean,
  active: boolean,
  onSilence: () => void,
): SilenceNudge {
  const onSilenceRef = useRef(onSilence);
  useEffect(() => {
    onSilenceRef.current = onSilence;
  });

  const [resetToken, setResetToken] = useState(0);
  const reset = useCallback(() => setResetToken((token) => token + 1), []);

  useEffect(() => {
    if (!active || isSpeaking) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = (delayMs: number) => {
      timeoutId = setTimeout(() => {
        onSilenceRef.current();
        scheduleNext(RENUDGE_COOLDOWN_MS);
      }, delayMs);
    };
    scheduleNext(SILENCE_NUDGE_MS);

    return () => clearTimeout(timeoutId);
  }, [active, isSpeaking, resetToken]);

  return { reset };
}
