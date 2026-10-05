import Link from "next/link";

import { EndInterviewButton } from "@/components/interview/end-interview-button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ScoreBadge } from "@/components/ui/score-badge";
import { roleLabel } from "@/lib/interview/role-label";
import { scoreBand } from "@/lib/score-band";
import type {
  CompetencyMastery,
  InterviewSession,
  PracticePlan,
  ReadinessOut,
  SessionStatus,
} from "@/lib/interview/types";

const STATUS_LABELS: Record<SessionStatus, string> = {
  in_progress: "In progress",
  completed: "Complete",
  ended_early: "Ended early",
};

const linkButton =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-pill)] px-6 text-sm font-medium";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The signed-in home: what to do next, drawn only from the person's real data. Nothing here is a
 * vanity statistic — every block either continues something, scores something that was measured,
 * or names a skill to practise. Blocks with no data say so instead of showing placeholders. */
export function DashboardView({
  sessions,
  role,
  readiness,
  plan,
  skills,
}: {
  sessions: InterviewSession[];
  /** The role the readiness / practice / skills blocks describe (null when nothing is practised). */
  role: string | null;
  readiness: ReadinessOut | null;
  plan: PracticePlan | null;
  skills: CompetencyMastery[];
}) {
  const inProgress = sessions.find((session) => session.status === "in_progress");
  const recent = sessions.slice(0, 5);
  // Only skills with at least two answers can honestly be called weak.
  const weakest = skills
    .filter((skill) => skill.questions_attempted >= 2)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <PageHeader
        eyebrow="Home"
        title="Continue training"
        description={
          sessions.length === 0
            ? "Choose a role, answer out loud, and get specific feedback on content and delivery."
            : "Pick up where you left off, or start a fresh round."
        }
        actions={
          sessions.length > 0 && !inProgress ? (
            <Link href="/interview" className={`${linkButton} bg-lime-fill text-lime-ink`}>
              Start new interview
            </Link>
          ) : null
        }
      />

      {inProgress ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-text text-lg font-semibold">Pick up where you left off</h2>
          <p className="text-muted text-sm">
            {roleLabel(inProgress.role, inProgress.role_title)} interview · question{" "}
            {inProgress.current_question_number} of {inProgress.question_count}. Your answers so far
            are saved.
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <Link
              href={`/interview?session=${encodeURIComponent(inProgress.id)}`}
              className={`${linkButton} bg-lime-fill text-lime-ink`}
            >
              Resume interview
            </Link>
            <EndInterviewButton sessionId={inProgress.id} label="End without finishing" />
          </div>
        </Card>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState
          title="You haven't completed an interview yet"
          description="Practice your first interview and Rehearse will start tracking your skills and progress."
          action={
            <Link href="/interview" className={`${linkButton} bg-lime-fill text-lime-ink`}>
              Start your first interview
            </Link>
          }
        />
      ) : null}

      {role ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
              {roleLabel(role)} readiness
            </h2>
            {readiness?.score != null ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-display text-text text-4xl font-bold">
                    {readiness.score}
                    <span className="text-muted text-lg"> / 100</span>
                  </p>
                  <ScoreBadge band={scoreBand(readiness.score)} />
                </div>
                <ProgressBar
                  value={readiness.score}
                  label={`${roleLabel(role)} readiness`}
                  valueText={`${readiness.score} out of 100`}
                />
              </>
            ) : (
              <p className="text-text text-base font-medium">Not enough practice yet to score</p>
            )}
            {readiness?.explanation[0] ? (
              <p className="text-muted text-sm">{readiness.explanation[0]}</p>
            ) : null}
            <Link
              href={`/mastery?role=${encodeURIComponent(role)}`}
              className="text-lime inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
            >
              See how it&apos;s calculated
            </Link>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
              Today&apos;s practice
            </h2>
            {plan && plan.today.length > 0 ? (
              <>
                <p className="text-text text-sm">
                  About {plan.estimated_minutes} minutes · {plan.question_count} questions · focus:{" "}
                  {plan.today.map((skill) => skill.name).join(", ")}
                </p>
                <Link
                  href={`/interview?${new URLSearchParams({
                    role,
                    count: "3",
                    topics: plan.focus_topics.join(","),
                  }).toString()}`}
                  className={`${linkButton} bg-lime-fill text-lime-ink w-fit`}
                >
                  Start today&apos;s practice
                </Link>
              </>
            ) : (
              <p className="text-muted text-sm">
                Nothing is due for review today. Weak skills come back sooner; strong ones every
                couple of weeks.
              </p>
            )}
          </Card>
        </div>
      ) : null}

      {weakest.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-text text-lg font-semibold">Skills to work on</h2>
          <ul className="flex flex-col gap-2">
            {weakest.map((skill) => (
              <li key={skill.competency} className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-text">{skill.name}</span>
                  <span className="text-muted font-mono-metric tabular-nums">
                    {skill.mastery}/100 · {skill.questions_attempted} answers
                  </span>
                </div>
                <ProgressBar
                  value={skill.mastery}
                  label={`${skill.name} mastery`}
                  valueText={`${skill.mastery} out of 100, ${scoreBand(skill.mastery).label}`}
                  tone={scoreBand(skill.mastery).tone}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-text text-lg font-semibold">Recent interviews</h2>
          <ul className="flex flex-col">
            {recent.map((session) => (
              <li key={session.id} className="border-line border-t first:border-t-0">
                <Link
                  href={`/session/${encodeURIComponent(session.id)}/summary`}
                  className="hover:bg-surface-2 flex min-h-11 items-center justify-between gap-4 rounded-[var(--radius-tile)] px-2 py-2 text-sm"
                >
                  <span className="text-text">
                    {roleLabel(session.role, session.role_title)}
                    <span className="text-muted"> · {formatDate(session.started_at)}</span>
                  </span>
                  <span className="text-muted text-xs">{STATUS_LABELS[session.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/progress"
            className="text-lime inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4"
          >
            All sessions and trends
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
