import Link from "next/link";

import { ScoreRing } from "@/components/report/score-ring";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { fetchSessionSummary } from "@/lib/interview/server";

const CATEGORY_LABELS: Record<string, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  situational: "Situational",
};

export default async function SessionSummaryPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const summary = await fetchSessionSummary(sessionId);

  if (!summary) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="font-display text-text text-xl font-bold">Summary not found</h1>
          <p className="text-muted text-sm">
            This session doesn&apos;t exist, or it isn&apos;t associated with your account.
          </p>
        </Card>
      </div>
    );
  }

  const sortedCategories = [...summary.category_breakdown].sort(
    (a, b) => (a.avg_star ?? 10) - (b.avg_star ?? 10),
  );
  const weakest = sortedCategories[0];
  const strongest = sortedCategories[sortedCategories.length - 1];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">Session complete</p>
        <h1 className="font-display text-text text-2xl font-bold text-balance">
          {summary.questions_completed} question{summary.questions_completed === 1 ? "" : "s"}{" "}
          answered
        </h1>
      </div>

      <Card className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-8">
          {summary.overall_score !== null ? (
            <ScoreRing score={Math.round(summary.overall_score)} label="Overall" />
          ) : null}
          <div className="grid flex-1 grid-cols-3 gap-6">
            <Stat
              label="Avg pace"
              value={summary.avg_wpm !== null ? Math.round(summary.avg_wpm) : "—"}
              unit="wpm"
            />
            <Stat
              label="Avg fillers"
              value={summary.avg_filler_count !== null ? Math.round(summary.avg_filler_count) : "—"}
            />
            <Stat
              label="Avg clarity"
              value={summary.avg_clarity !== null ? Math.round(summary.avg_clarity) : "—"}
            />
          </div>
        </div>

        {summary.category_breakdown.length > 0 ? (
          <div>
            <h2 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
              By category
            </h2>
            <ul className="flex flex-col gap-2">
              {summary.category_breakdown.map((row) => (
                <li
                  key={row.category}
                  className="border-line flex items-center justify-between rounded-[var(--radius-tile)] border px-4 py-3 text-sm"
                >
                  <span className="text-text">{CATEGORY_LABELS[row.category] ?? row.category}</span>
                  <span className="text-muted font-mono-metric tabular-nums">
                    {row.avg_star !== null ? `${row.avg_star.toFixed(1)}/10` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {strongest && weakest && strongest.category !== weakest.category ? (
          <p className="bg-lime/10 text-text rounded-[var(--radius-tile)] px-4 py-3 text-sm">
            <span className="text-lime font-medium">Strongest area —</span>{" "}
            {CATEGORY_LABELS[strongest.category] ?? strongest.category}. Focus your next practice
            round on{" "}
            <span className="font-medium">
              {CATEGORY_LABELS[weakest.category] ?? weakest.category}
            </span>
            .
          </p>
        ) : null}

        <div className="border-line flex flex-col items-center gap-3 border-t pt-6 text-center">
          <p className="text-muted text-sm">Ready for another round?</p>
          <div className="flex gap-3">
            <Link
              href="/progress"
              className="border-line text-text inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border px-6 text-sm font-medium transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
            >
              View progress
            </Link>
            <Link
              href="/interview"
              className="bg-lime text-lime-ink inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] px-6 text-sm font-medium transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110"
            >
              Start a new session
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
