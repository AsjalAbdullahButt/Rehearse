"use client";

import { useEffect, useState } from "react";

// Average byte-frequency-data amplitude (0-255) above which the mic is considered "someone is
// speaking" rather than room noise/silence. A heuristic, not a calibrated VAD — good enough to
// notice a long pause, not to be lab-accurate.
const SPEAKING_VOLUME_THRESHOLD = 15;
const SAMPLE_INTERVAL_MS = 100;

export interface VoiceActivity {
  isSpeaking: boolean;
  /** True once the person has said anything at all since this recording started — lets a
   * caller tell "hasn't started yet" apart from "was talking, paused". */
  hasSpokenAtAll: boolean;
}

/** Polls `analyser` — the same AnalyserNode Waveform already reads, so this adds no extra mic
 * consumer — every SAMPLE_INTERVAL_MS to classify speaking vs. silence. React state only
 * updates on an actual speaking/silence transition, never every animation frame (see
 * Waveform's docstring for why that matters for render cost). */
export function useVoiceActivity(analyser: AnalyserNode | null, active: boolean): VoiceActivity {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasSpokenAtAll, setHasSpokenAtAll] = useState(false);

  // Reset for a fresh recording the moment `active` flips — guarded state update during
  // render (see use-countdown.ts for the same pattern), not an effect.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) {
      setIsSpeaking(false);
      setHasSpokenAtAll(false);
    }
  }

  useEffect(() => {
    if (!analyser || !active) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    let wasSpeakingLastSample = false;

    const interval = setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
      const average = sum / data.length;
      const speakingNow = average > SPEAKING_VOLUME_THRESHOLD;

      if (speakingNow !== wasSpeakingLastSample) {
        wasSpeakingLastSample = speakingNow;
        setIsSpeaking(speakingNow);
      }
      if (speakingNow) setHasSpokenAtAll(true);
    }, SAMPLE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [analyser, active]);

  return { isSpeaking, hasSpokenAtAll };
}
