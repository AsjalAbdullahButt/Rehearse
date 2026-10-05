import { cn } from "@/lib/utils";

/** Progress through a multi-step form. Completed steps are buttons (jump back without losing
 * anything); upcoming steps are plain text so nobody skips required input. */
export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: readonly { id: string; label: string }[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  done && "bg-mint/15 text-mint",
                  active && "bg-lime-fill text-lime-ink",
                  !done && !active && "bg-surface-2 text-muted",
                )}
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  active ? "text-text" : "text-muted",
                  // On narrow screens only the active step's name is shown; the rest stay numbered.
                  !active && "hidden sm:inline",
                )}
              >
                {step.label}
              </span>
            </>
          );
          return (
            <li
              key={step.id}
              aria-current={active ? "step" : undefined}
              className="flex items-center gap-2"
            >
              {done ? (
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className="focus-visible:outline-lime flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] pr-1 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {content}
                  <span className="sr-only">(completed — go back)</span>
                </button>
              ) : (
                <span className="flex min-h-11 items-center gap-2">{content}</span>
              )}
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="bg-line hidden h-px w-4 sm:block" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
