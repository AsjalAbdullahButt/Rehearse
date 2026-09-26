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

/** Clamps a score/max pair to a 0-1 fraction — shared by ScoreRing and StarBars so an
 * out-of-range score (a bad LLM response, a future bug) can't overflow a filled bar past 100%
 * or draw it negative, even though the label text beside it still shows the raw score. */
export function clampFraction(value: number, max: number): number {
  return Math.max(0, Math.min(1, value / max));
}

/** Only accepts an in-app relative path — must start with a single `/`, not `//` (a
 * protocol-relative URL) or contain a `:` (a scheme, e.g. `javascript:` or `https:`) — so a
 * `?next=` query param from a redirect link can't send a signed-in user to an external site.
 * Anything else falls back to `fallback`. */
export function sanitizeNextPath(next: string | null, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes(":")) return fallback;
  return next;
}
