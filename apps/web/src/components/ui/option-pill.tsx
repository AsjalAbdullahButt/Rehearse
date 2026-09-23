import { cn } from "@/lib/utils";

export function OptionPill<T extends string>({
  value,
  label,
  selected,
  onSelect,
}: {
  value: T;
  label: string;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      className={cn(
        "focus-visible:outline-lime rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        selected
          ? "bg-lime text-lime-ink border-lime"
          : "border-line bg-surface-2 text-text hover:bg-surface",
      )}
    >
      {label}
    </button>
  );
}
