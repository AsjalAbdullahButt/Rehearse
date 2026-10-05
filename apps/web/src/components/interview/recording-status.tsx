import { cn } from "@/lib/utils";

export type RecordingPhase =
  "ready" | "preparing" | "recording" | "finishing" | "reviewing" | "processing";

const PHASES: Record<RecordingPhase, { label: string; dot: string }> = {
  ready: { label: "Ready to record", dot: "bg-muted" },
  preparing: { label: "Get ready", dot: "bg-amber" },
  recording: { label: "Recording", dot: "bg-coral animate-pulse" },
  finishing: { label: "Finishing recording", dot: "bg-amber" },
  reviewing: { label: "Recording complete — review it", dot: "bg-mint" },
  processing: { label: "Transcribing and evaluating", dot: "bg-violet animate-pulse" },
};

/** The single, always-visible answer to "is this recording?" — a dot, a word and (while live) the
 * elapsed/remaining clock. Not colour-only: the label changes with the phase, and a polite live
 * region announces transitions to screen readers. */
export function RecordingStatus({
  phase,
  clock,
  className,
}: {
  phase: RecordingPhase;
  /** Formatted countdown shown beside the label while recording. */
  clock?: string;
  className?: string;
}) {
  const { label, dot } = PHASES[phase];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "border-line bg-surface-2 text-text inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-1.5 text-sm font-medium",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", dot)} />
      <span>{label}</span>
      {phase === "recording" && clock ? (
        <span className="font-mono-metric text-muted tabular-nums">{clock} left</span>
      ) : null}
    </div>
  );
}
