import { EndInterviewButton } from "@/components/interview/end-interview-button";
import { ClaimsList } from "@/components/report/claims-list";
import { RecoveryState } from "@/components/ui/recovery-state";
import Link from "next/link";

import { ScoreRing } from "@/components/report/score-ring";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { repeatSetupHref } from "@/lib/interview/repeat-link";
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
  const summary = await fetchSessionSummary(sessionId).catch(() => undefined);

  if (!summary) {
    return (
      <RecoveryState
        title={summary === undefined ? "Could not load your summary" : "Summary not found"}
        description={
          summary === undefined
            ? "Your data could not be loaded right now. Please try again."
            : "This summary does not exist or is not associated with your account."
        }
        retry={summary === undefined}
      />
    );
  }

  const sortedCategories = summary.category_breakdown
    .filter((row) => row.avg_score !== null)
    .sort((a, b) => (a.avg_score ?? 10) - (b.avg_score ?? 10));
  const weakest = sortedCategories[0];
  const strongest = sortedCategories[sortedCategories.length - 1];
  const hasScoreDifference = strongest && weakest && strongest.avg_score !== weakest.avg_score;
  const canResume =
    summary.session.status === "in_progress" && Boolean(summary.session.current_question);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">
          {summary.session.status === "completed"
            ? "Session complete"
            : summary.session.status === "ended_early"
              ? "Interview ended early"
              : "Your progress so far"}
        </p>
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
                    {row.avg_score !== null ? `${row.avg_score.toFixed(1)}/10` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {summary.panel_assessments.length > 0 ? (
          <div>
            <h2 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
              Panel assessment
            </h2>
            <ul className="flex flex-col gap-2">
              {summary.panel_assessments.map((row) => (
                <li
                  key={row.panelist}
                  className="border-line flex items-center justify-between rounded-[var(--radius-tile)] border px-4 py-3 text-sm"
                >
                  <span className="text-text">
                    {row.label}{" "}
                    <span className="text-muted">
                      ({row.name}, {row.questions} {row.questions === 1 ? "question" : "questions"})
                    </span>
                  </span>
                  <span className="text-muted font-mono-metric tabular-nums">
                    {row.avg_score !== null ? `${row.avg_score.toFixed(1)}/10` : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted mt-2 text-xs">
              Simulated interviewers. Each score is the average for the questions that panelist
              asked.
            </p>
          </div>
        ) : null}

        <ClaimsList
          claims={summary.claims.filter((claim) => claim.status !== "well_supported")}
          heading="Claims that need preparation"
        />

        {hasScoreDifference ? (
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
          <p className="text-muted text-sm">
            {canResume
              ? "Your answers are saved. Continue when you are ready."
              : "Ready for another round?"}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {canResume ? (
              <Link
                href={`/interview?session=${encodeURIComponent(summary.session.id)}`}
                className="bg-lime-fill text-lime-ink inline-flex min-h-11 items-center rounded-[var(--radius-pill)] px-6 text-sm font-medium"
              >
                Resume interview
              </Link>
            ) : null}
            {canResume ? <EndInterviewButton sessionId={summary.session.id} /> : null}
            <Link
              href="/progress"
              className="border-line text-text inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border px-6 text-sm font-medium transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
            >
              View progress
            </Link>
            {weakest && strongest && strongest.category !== weakest.category ? (
              <Link
                href={`/interview?role=${encodeURIComponent(summary.session.role)}&focus=${weakest.category}`}
                className="border-line text-text inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border px-6 text-sm font-medium transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
              >
                Practice {CATEGORY_LABELS[weakest.category] ?? weakest.category}
              </Link>
            ) : null}
            <Link
              href={repeatSetupHref(summary.session)}
              className="border-line text-text inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border px-6 text-sm font-medium transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
            >
              Repeat this setup
            </Link>
            <Link
              href="/interview"
              className="bg-lime-fill text-lime-ink inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] px-6 text-sm font-medium transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110"
            >
              Start a new session
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
