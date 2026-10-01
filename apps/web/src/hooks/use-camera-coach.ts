"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CameraAccumulator, type CameraSummary } from "@/lib/camera/pose";

const DETECT_INTERVAL_MS = 100;
const WASM_BASE_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";

export type CameraCoachStatus = "off" | "starting" | "ready" | "error";

interface FaceLandmarkerLike {
  detectForVideo(
    video: HTMLVideoElement,
    timestampMs: number,
  ): { faceLandmarks: { x: number; y: number }[][] };
  close(): void;
}

/** The optional camera coach. While `enabled` it opens the camera and loads an on-device face
 * model (served from this app's own origin); while `recording` it samples head pose ten times a
 * second into a running summary. Frames are never stored or uploaded — only the final handful of
 * numbers (`getSummary`) is ever sent, and only if the user turned this on. */
export function useCameraCoach({ enabled, recording }: { enabled: boolean; recording: boolean }): {
  status: CameraCoachStatus;
  attachVideo: (element: HTMLVideoElement | null) => void;
  getSummary: () => CameraSummary | null;
} {
  const [accumulator] = useState(() => new CameraAccumulator());
  const [phase, setPhase] = useState<"idle" | "ready" | "error">("idle");
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (!enabled) setPhase("idle");
  }

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerLike | null>(null);

  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (element && streamRef.current) element.srcObject = streamRef.current;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 320, height: 240 },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE_PATH);
        const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    }
    void start();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled]);

  const ready = enabled && phase === "ready";
  useEffect(() => {
    if (!ready || !recording) return;
    accumulator.reset();
    const id = window.setInterval(() => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      accumulator.addFrame(now, result.faceLandmarks[0] ?? null);
    }, DETECT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [ready, recording, accumulator]);

  const getSummary = useCallback(() => accumulator.summary(), [accumulator]);

  const status: CameraCoachStatus = !enabled
    ? "off"
    : phase === "idle"
      ? "starting"
      : phase === "ready"
        ? "ready"
        : "error";
  return { status, attachVideo, getSummary };
}
