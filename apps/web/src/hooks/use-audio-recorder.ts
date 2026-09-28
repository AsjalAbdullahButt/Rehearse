"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "stopped";
export type RecorderErrorKind = "permission-denied" | "no-device" | "unavailable";

export interface RecorderError {
  kind: RecorderErrorKind;
  message: string;
}

export interface AudioRecorder {
  status: RecorderStatus;
  error: RecorderError | null;
  analyser: AnalyserNode | null;
  /** True from the moment `start()` is called until getUserMedia settles — covers the gap
   * before `status` has any way to reflect "requesting permission" (it only distinguishes
   * idle/recording/stopped). Callers should disable their "Start recording" control on this,
   * not just on `status === "recording"`, so a user can't double-click their way into two
   * concurrent permission requests. */
  isStarting: boolean;
  start: () => Promise<void>;
  stop: () => void;
  /** Clears a "stopped" status back to "idle" once the caller has fully consumed that
   * recording's blob — needed after a throwaway recording (the interview flow's mic-check test)
   * so a fresh, unrelated question doesn't inherit a stale "stopped" status and read as still
   * finalizing a recording that never actually happened. A no-op while actively recording — it
   * only ever moves "stopped" to "idle", never interrupts a live recording. */
  reset: () => void;
}

const PREFERRED_MIME_TYPE = "audio/webm;codecs=opus";
const FALLBACK_MIME_TYPE = "audio/webm";
const AUDIO_BITS_PER_SECOND = 32_000;

const RECORDER_ERROR_MESSAGES: Record<RecorderErrorKind, string> = {
  "permission-denied":
    "Microphone access is blocked. Click the lock or camera icon in your browser's address bar, allow the microphone, then try again.",
  "no-device": "No microphone was found. Connect one and try again.",
  unavailable: "Microphone access is unavailable on this device or browser.",
};

function recorderErrorKind(error: unknown): RecorderErrorKind {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "permission-denied";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "no-device";
    }
  }
  return "unavailable";
}

/** Wraps getUserMedia + MediaRecorder + an AnalyserNode for live level visualization. Audio
 * never leaves this hook except as the single Blob handed to `onStopped` — nothing here
 * writes it to disk or a URL that could persist it. */
export function useAudioRecorder(onStopped: (blob: Blob) => void): AudioRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<RecorderError | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const onStoppedRef = useRef(onStopped);
  useEffect(() => {
    onStoppedRef.current = onStopped;
  });

  // Guards start() against re-entrancy (a second call while getUserMedia() is pending is a
  // no-op) and lets stop()/unmount "supersede" a still-pending start() — checked synchronously,
  // unlike the isStarting *state* above, which only exists to drive the UI.
  const isStartingRef = useRef(false);
  const startGenerationRef = useRef(0);

  const releaseResources = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => undefined);
    }
    audioContextRef.current = null;
    setAnalyser(null);
  }, []);

  useEffect(() => {
    return () => {
      // Supersede any start() still awaiting getUserMedia() at unmount time, so its stream
      // (once the permission prompt resolves) gets stopped immediately below instead of
      // leaking a live mic that nothing is using anymore.
      startGenerationRef.current += 1;
      releaseResources();
    };
  }, [releaseResources]);

  const start = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsStarting(true);
    const generation = ++startGenerationRef.current;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (generation !== startGenerationRef.current) {
        // Superseded while the permission prompt was pending (stop() or unmount ran in the
        // meantime) — this stream was never wanted; release it rather than leaving the mic
        // active with nothing consuming it.
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 128;
      source.connect(analyserNode);
      setAnalyser(analyserNode);

      const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)
        ? PREFERRED_MIME_TYPE
        : FALLBACK_MIME_TYPE;
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        releaseResources();
        onStoppedRef.current(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch (caughtError) {
      if (generation !== startGenerationRef.current) return;
      const kind = recorderErrorKind(caughtError);
      setError({ kind, message: RECORDER_ERROR_MESSAGES[kind] });
      setStatus("idle");
    } finally {
      isStartingRef.current = false;
      setIsStarting(false);
    }
  }, [releaseResources]);

  const stop = useCallback(() => {
    // Supersede a still-pending start() (see the generation check above) — if the user clicked
    // stop before the permission prompt resolved, the eventual stream should be released, not
    // turned into a recording.
    startGenerationRef.current += 1;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setStatus("stopped");
  }, []);

  const reset = useCallback(() => {
    setStatus((current) => (current === "stopped" ? "idle" : current));
  }, []);

  return { status, error, analyser, isStarting, start, stop, reset };
}
