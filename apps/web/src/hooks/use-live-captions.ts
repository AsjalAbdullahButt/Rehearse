"use client";

import { useEffect, useState } from "react";

// TypeScript's bundled DOM lib already has SpeechRecognitionResult/ResultList/Alternative (the
// nested shapes below), but not the SpeechRecognition interface/constructor itself or the
// window properties that expose it — those are declared here.
interface SpeechRecognitionEventLike extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export interface LiveCaptions {
  /** False on a browser without SpeechRecognition (Firefox, Safari < 17, ...) — callers should
   * hide the caption UI entirely rather than show a box that silently never fills in. */
  isSupported: boolean;
  transcript: string;
}

/** Live, client-side captions of what the person is saying while recording — purely for their
 * own benefit, so they can see they're being heard correctly. This never feeds the actual
 * answer: the transcript that gets scored still comes from Groq after upload (see
 * use-audio-recorder.ts) — this is the browser's own SpeechRecognition engine, a second,
 * independent consumer of the same already-granted microphone permission. */
export function useLiveCaptions(active: boolean): LiveCaptions {
  const [transcript, setTranscript] = useState("");
  const isSupported = Boolean(getSpeechRecognitionConstructor());

  // Clear for a fresh recording the moment `active` flips — guarded state update during
  // render (see use-countdown.ts/use-voice-activity.ts for the same pattern), not the effect
  // below, which react-hooks/set-state-in-effect flags as a cascading-render risk.
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setTranscript("");
  }

  useEffect(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!active || !Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results.item(i).item(0).transcript;
      }
      setTranscript(combined.trim());
    };
    // Some browsers stop listening after a few seconds of silence even with continuous=true —
    // restart transparently while the recording is still active, instead of leaving captions
    // frozen mid-answer. onend also fires after most onerror cases, so this covers those too.
    recognition.onend = () => {
      if (active) {
        try {
          recognition.start();
        } catch {
          // Already starting/started — a restart race, not a real failure.
        }
      }
    };

    try {
      recognition.start();
    } catch {
      // start() throws if already running; nothing to do differently here.
    }

    return () => {
      recognition.onend = null;
      recognition.stop();
    };
  }, [active]);

  return { isSupported, transcript };
}
