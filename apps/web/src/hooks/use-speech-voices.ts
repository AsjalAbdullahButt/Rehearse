"use client";

import { useEffect, useState } from "react";

/** Chrome (and others) populate the voice list asynchronously — an initial `getVoices()` call
 * often returns empty until the "voiceschanged" event fires, so both are needed. */
export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    // `getVoices()` returns a fresh array every call and some browsers fire "voiceschanged"
    // repeatedly, so keep the previous array when the list is unchanged — otherwise consumers that
    // depend on it (the interview's `speak`) would re-run and re-read the question aloud each time.
    const loadVoices = () => {
      const next = window.speechSynthesis.getVoices();
      setVoices((prev) =>
        prev.length === next.length &&
        prev.every((voice, i) => voice.voiceURI === next[i]?.voiceURI)
          ? prev
          : next,
      );
    };
    loadVoices();

    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  return voices;
}
