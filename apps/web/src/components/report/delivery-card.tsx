import type { DeliveryItem, DeliveryRating } from "@/lib/interview/types";
import { cn } from "@/lib/utils";

const RATING_LABELS: Record<DeliveryRating, string> = {
  good: "Good",
  ok: "Okay",
  needs_work: "Needs work",
  not_measured: "Not measured",
};

const RATING_STYLES: Record<DeliveryRating, string> = {
  good: "bg-mint/15 text-mint",
  ok: "bg-amber/15 text-amber",
  needs_work: "bg-coral/15 text-coral",
  not_measured: "bg-surface-2 text-muted",
};

/** One delivery section (voice, or the optional camera coach). Ratings are written out as words,
 * never colour alone, and each row says what was measured rather than showing a bare score. */
export function DeliveryCard({
  heading,
  items,
  advice,
  footnote,
}: {
  heading: string;
  items: DeliveryItem[];
  advice: string[];
  footnote?: string;
}) {
  return (
    <section aria-label={heading} className="flex flex-col gap-4">
      <h3 className="text-muted text-xs font-medium tracking-wide uppercase">{heading}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.key}
            className="border-line flex flex-col gap-1 rounded-[var(--radius-tile)] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-text text-sm font-medium">{item.label}</span>
              <span className="text-muted text-xs">{item.detail}</span>
            </div>
            <span
              className={cn(
                "w-fit shrink-0 rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium",
                RATING_STYLES[item.rating],
              )}
            >
              {RATING_LABELS[item.rating]}
            </span>
          </li>
        ))}
      </ul>
      {advice.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {advice.map((line) => (
            <li key={line} className="text-text flex gap-2 text-sm">
              <span className="text-lime" aria-hidden="true">
                →
              </span>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {footnote ? <p className="text-muted text-xs">{footnote}</p> : null}
    </section>
  );
}
