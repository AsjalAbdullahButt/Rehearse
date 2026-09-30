"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { cn, formatTime } from "@/lib/utils";

// TypeScript's DOM lib doesn't declare the vendor-prefixed constructor older Safari still
// needs for the Web Audio API.
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const BAR_COUNT = 56;
const PLACEHOLDER_PEAKS = Array.from({ length: BAR_COUNT }, () => 0.3);

const PlayIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-4 w-4 translate-x-0.5"
    aria-hidden="true"
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

/** Downsamples a decoded AudioBuffer into BAR_COUNT peak-amplitude values (0-1, normalized to
 * the loudest bar) — a real waveform of what was actually recorded, not a canned decoration.
 * Returns null on anything undecodable (an unsupported codec in this browser, a corrupt blob);
 * callers fall back to a flat placeholder shape rather than failing playback entirely — the
 * underlying <audio> element doesn't depend on this succeeding. */
async function decodePeaks(blob: Blob): Promise<number[] | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    const audioContext = new AudioContextCtor();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(channelData.length / BAR_COUNT));

    const peaks: number[] = [];
    for (let bar = 0; bar < BAR_COUNT; bar++) {
      let max = 0;
      const start = bar * samplesPerBar;
      const end = Math.min(start + samplesPerBar, channelData.length);
      for (let i = start; i < end; i++) {
        const value = Math.abs(channelData[i] ?? 0);
        if (value > max) max = value;
      }
      peaks.push(max);
    }
    void audioContext.close();

    const loudest = Math.max(...peaks, 0.01);
    return peaks.map((peak) => peak / loudest);
  } catch {
    return null;
  }
}

/** A custom playback control for the "listen back before you submit" review step — real
 * transport semantics (a native <button> + a native <input type="range"> underneath the visual
 * waveform, so keyboard/screen-reader users get the same play/pause/seek any audio player
 * should have) instead of the browser's inconsistent-looking default `<audio controls>` chrome.
 * The waveform bars are the actual decoded shape of this recording, not decoration — up to the
 * playhead in lime, after it muted, exactly like a voice-memo/SoundCloud-style scrubber. */
export function AnswerPlayback({ blob }: { blob: Blob }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  const objectUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => {
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  useEffect(() => {
    let cancelled = false;
    void decodePeaks(blob).then((decoded) => {
      if (!cancelled && decoded) setPeaks(decoded);
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    // Driven by React's own `isPlaying` state (kept current via the audio element's onPlay/
    // onPause/onEnded events below), not `audio.paused` — a single source of truth for what the
    // button should do next, rather than trusting the native element's own state getter to have
    // already settled by the time this runs.
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const value = Number(event.target.value);
    if (audio) audio.currentTime = value;
    setCurrentTime(value);
  }

  const progress = duration > 0 ? currentTime / duration : 0;
  const bars = peaks ?? PLACEHOLDER_PEAKS;

  return (
    <div className="bg-surface-2 border-line flex w-full items-center gap-3 rounded-[var(--radius-tile)] border px-4 py-3">
      <audio
        ref={audioRef}
        src={objectUrl}
        preload="metadata"
        className="hidden"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause recording" : "Play recording"}
        className="bg-lime-fill text-lime-ink focus-visible:outline-lime flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform duration-150 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="focus-within:outline-lime relative flex h-10 flex-1 items-center rounded-[var(--radius-tile)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">
        <div
          className="pointer-events-none absolute inset-0 flex items-center gap-[2px] px-0.5"
          aria-hidden="true"
        >
          {bars.map((peak, index) => {
            const played = index / bars.length <= progress;
            return (
              <div
                key={index}
                className={cn(
                  "min-h-[2px] w-full flex-1 rounded-full transition-colors duration-150",
                  played ? "bg-lime" : "bg-line",
                )}
                style={{ height: `${Math.max(0.12, peak) * 100}%` }}
              />
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Seek recording"
          className="relative z-10 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>

      <span className="font-mono-metric text-muted w-20 shrink-0 text-right text-xs tabular-nums">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}
