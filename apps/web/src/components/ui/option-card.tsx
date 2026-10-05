import { cn } from "@/lib/utils";

/** A radio rendered as a selectable card with a one-line explanation — for choices where the
 * label alone doesn't say enough (interview mode, focus). Same native-radio semantics as
 * OptionPill, so keyboard and screen-reader behaviour is the browser's own. */
export function OptionCard<T extends string>({
  value,
  label,
  description,
  selected,
  onSelect,
  name,
}: {
  value: T;
  label: string;
  description: string;
  selected: boolean;
  onSelect: (value: T) => void;
  name: string;
}) {
  return (
    <label className="relative flex cursor-pointer">
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
          "peer-focus-visible:outline-lime flex w-full flex-col gap-1 rounded-[var(--radius-tile)] border p-4 transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
          selected ? "border-lime bg-lime/10" : "border-line bg-surface-2/40 hover:bg-surface-2",
        )}
      >
        <span className="text-text flex items-center justify-between gap-2 text-sm font-medium">
          {label}
          {selected ? (
            <span aria-hidden="true" className="text-lime">
              ✓
            </span>
          ) : null}
        </span>
        <span className="text-muted text-xs">{description}</span>
      </span>
    </label>
  );
}
