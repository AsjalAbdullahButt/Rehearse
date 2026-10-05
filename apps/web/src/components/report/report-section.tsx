import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const REPORT_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "breakdown", label: "Breakdown" },
  { id: "answer", label: "Your answer" },
  { id: "delivery", label: "Pace and delivery" },
  { id: "next-steps", label: "Next steps" },
] as const;

/** One titled part of the report. A real <section> with an accessible name, so the page reads as
 * a set of landmarks rather than one long wall of text. */
export function ReportSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: (typeof REPORT_SECTIONS)[number]["id"];
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `report-${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("border-line flex scroll-mt-24 flex-col gap-5 border-t pt-8", className)}
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-display text-text text-xl font-bold">
          {title}
        </h2>
        {description ? <p className="text-muted text-sm">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** In-page jump links. Plain anchors: they work without JavaScript and in print they're hidden. */
export function ReportNav() {
  return (
    <nav aria-label="Report sections" className="no-print -mx-1 flex flex-wrap gap-1">
      {REPORT_SECTIONS.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-lime inline-flex min-h-11 items-center rounded-[var(--radius-pill)] px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
