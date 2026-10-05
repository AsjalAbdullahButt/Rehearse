import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  lime: "bg-lime",
  mint: "bg-mint",
  amber: "bg-amber",
  coral: "bg-coral",
  violet: "bg-violet",
} as const;

export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  tone = "lime",
  className,
}: {
  value: number;
  max?: number;
  /** Accessible name — required, a bare bar means nothing to a screen reader. */
  label: string;
  valueText?: string;
  tone?: keyof typeof TONE_CLASSES;
  className?: string;
}) {
  const fraction = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(Math.max(0, Math.min(max, value)))}
      aria-valuetext={valueText}
      className={cn("bg-surface-2 h-2 w-full overflow-hidden rounded-full", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", TONE_CLASSES[tone])}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
