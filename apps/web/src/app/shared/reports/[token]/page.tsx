import { ClaimsList } from "@/components/report/claims-list";
import { DeliveryCard } from "@/components/report/delivery-card";
import { ExportReportButton } from "@/components/report/export-report-button";
import { RubricBars } from "@/components/report/rubric-bars";
import { ScoreRing } from "@/components/report/score-ring";
import { TranscriptHighlight } from "@/components/report/transcript-highlight";
import { Card } from "@/components/ui/card";
import { RecoveryState } from "@/components/ui/recovery-state";
import { Stat } from "@/components/ui/stat";
import { hasCompleteFeedback } from "@/lib/interview/feedback";
import { rubricAreas } from "@/lib/interview/rubric-insights";
import { fetchSharedReport } from "@/lib/interview/server";
import { toTranscriptParts } from "@/lib/interview/transcript";
import type { Category, ReportShareAudience } from "@/lib/interview/types";

const CATEGORY_LABELS: Record<Category, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  situational: "Situational",
};

const AUDIENCE_LABELS: Record<ReportShareAudience, string> = {
  mentor: "Mentor report",
  recruiter: "Recruiter report",
  professor: "Professor report",
};

function formatRole(role: string, roleTitle: string | null): string {
  if (roleTitle) return roleTitle;
  return role
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string {
  if (!value) return "No expiration";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await fetchSharedReport(token).catch(() => null);

  if (!shared || !hasCompleteFeedback(shared.report.feedback)) {
    return (
      <RecoveryState
        title="Shared report not available"
        description="This link may have expired, been revoked, or never existed."
      />
    );
  }

  const { report, session, share } = shared;
  const feedback = report.feedback;
  const role = formatRole(session.session.role, session.session.role_title);
  const focusItems = [
    ...feedback.improvements.slice(0, 3),
    ...feedback.missing_information.slice(0, 2),
  ].slice(0, 4);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">
          {AUDIENCE_LABELS[share.audience]} &middot; read-only
        </p>
        <h1 className="font-display text-text text-3xl font-bold text-balance">
          Candidate assessment
        </h1>
        <p className="text-muted max-w-2xl text-sm leading-relaxed">
          Shared by the candidate from Rehearse. Raw audio and video are never included.{" "}
          {report.transcript
            ? "The candidate chose to include their transcript."
            : "The transcript is not included; this report has the coaching and interview summary only."}
        </p>
        <ExportReportButton />
      </div>

      <Card className="grid gap-4 sm:grid-cols-4">
        <Stat label="Target role" value={role} />
        <Stat label="Questions" value={session.questions_completed} />
        <Stat label="Overall" value={session.overall_score ?? "Not enough data"} />
        <Stat label="Expires" value={formatDate(share.expires_at)} />
      </Card>

      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-muted text-xs font-medium tracking-wide uppercase">
            Question {report.question_number} of {report.question_count} &middot;{" "}
            {CATEGORY_LABELS[report.category]}
          </p>
          <h2 className="text-text text-xl font-semibold text-balance">{report.question_text}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-8">
          <ScoreRing score={feedback.clarity} label="Clarity" />
          <div className="grid w-full grid-cols-2 gap-4 sm:w-auto sm:flex-1 sm:grid-cols-3">
            <Stat label="Pace" value={Math.round(report.wpm)} unit="wpm" />
            <Stat label="Fillers" value={report.filler_count} />
            <Stat label="Long pauses" value={report.long_pauses} />
          </div>
        </div>

        <div>
          <h3 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
            Rubric breakdown
          </h3>
          <RubricBars items={rubricAreas(feedback.rubric)} />
        </div>

        {report.transcript ? (
          <details className="border-line rounded-[var(--radius-tile)] border p-4">
            <summary className="text-text cursor-pointer text-sm font-medium">
              Transcript (shared by the candidate)
            </summary>
            <TranscriptHighlight
              parts={toTranscriptParts(report.transcript_parts)}
              className="text-text mt-4 text-sm leading-relaxed"
            />
          </details>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h3 className="text-muted text-xs font-medium tracking-wide uppercase">Strengths</h3>
            <ul className="flex flex-col gap-2">
              {feedback.strengths.slice(0, 4).map((strength, index) => (
                <li key={index} className="text-text text-sm">
                  {strength}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-muted text-xs font-medium tracking-wide uppercase">
              Recommended preparation
            </h3>
            <ol className="flex list-decimal flex-col gap-2 pl-5">
              {focusItems.map((item, index) => (
                <li key={index} className="text-text text-sm">
                  {item}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {report.delivery ? (
          <DeliveryCard
            heading="Delivery"
            items={report.delivery.items}
            advice={report.delivery.advice}
            footnote="Delivery coaching is separate from content scoring."
          />
        ) : null}

        <ClaimsList claims={session.claims} heading="Claims to prepare for follow-up" />

        {feedback.evidence.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h3 className="text-muted text-xs font-medium tracking-wide uppercase">
              Verified evidence from the answer
            </h3>
            <ul className="flex flex-col gap-2">
              {feedback.evidence.slice(0, 4).map((quote, index) => (
                <li key={index} className="border-line text-muted border-l-2 pl-3 text-sm italic">
                  &ldquo;{quote}&rdquo;
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Card>
    </main>
  );
}
