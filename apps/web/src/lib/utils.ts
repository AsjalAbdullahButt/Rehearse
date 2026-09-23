import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The countdown color rule used by both the landing demo timer and the real interview
 * recorder: neutral above 30s remaining, amber at 30s, coral at 10s. */
export function getTimerTone(remainingSeconds: number): "text-coral" | "text-amber" | "text-text" {
  if (remainingSeconds <= 10) return "text-coral";
  if (remainingSeconds <= 30) return "text-amber";
  return "text-text";
}
