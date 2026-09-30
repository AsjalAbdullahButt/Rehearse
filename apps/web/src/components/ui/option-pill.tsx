import { cn } from "@/lib/utils";
export function OptionPill<T extends string>({
  value,
  label,
  selected,
  onSelect,
  name,
}: {
  value: T;
  label: string;
  selected: boolean;
  onSelect: (value: T) => void;
  name: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <span
        className={cn(
          "peer-focus-visible:outline-lime inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-medium transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
          selected
            ? "bg-lime-fill text-lime-ink border-lime-fill"
            : "border-line bg-surface-2 text-text hover:bg-surface",
        )}
      >
        {label}
      </span>
    </label>
  );
}
