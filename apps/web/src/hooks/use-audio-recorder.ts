"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "stopped";

export interface AudioRecorder {
  status: RecorderStatus;
  error: string | null;
  analyser: AnalyserNode | null;
  start: () => Promise<void>;
  stop: () => void;
}

const PREFERRED_MIME_TYPE = "audio/webm;codecs=opus";
const FALLBACK_MIME_TYPE = "audio/webm";
const AUDIO_BITS_PER_SECOND = 32_000;

/** Wraps getUserMedia + MediaRecorder + an AnalyserNode for live level visualization. Audio
 * never leaves this hook except as the single Blob handed to `onStopped` — nothing here
 * writes it to disk or a URL that could persist it. */
export function useAudioRecorder(onStopped: (blob: Blob) => void): AudioRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

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

  useEffect(() => releaseResources, [releaseResources]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    } catch {
      setError("Microphone access was denied or is unavailable.");
      setStatus("idle");
    }
  }, [releaseResources]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setStatus("stopped");
  }, []);

  return { status, error, analyser, start, stop };
}
