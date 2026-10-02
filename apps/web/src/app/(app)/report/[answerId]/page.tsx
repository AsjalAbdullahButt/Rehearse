import Link from "next/link";

import { RecoveryState } from "@/components/ui/recovery-state";
import { DeliveryCard } from "@/components/report/delivery-card";
import { ClaimsList } from "@/components/report/claims-list";
import { AttemptComparison } from "@/components/report/attempt-comparison";
import { RetryAnswer } from "@/components/report/retry-answer";
import { BeforeAfterToggle } from "@/components/report/before-after-toggle";
import { ExportReportButton } from "@/components/report/export-report-button";
import { ReportNextSteps } from "@/components/report/report-next-steps";
import { ShareReportControl } from "@/components/report/share-report-control";
import { RubricBars } from "@/components/report/rubric-bars";
import { ScoreRing } from "@/components/report/score-ring";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { hasCompleteFeedback } from "@/lib/interview/feedback";
import { rubricAreas, strongestRubricArea } from "@/lib/interview/rubric-insights";
import { fetchAnswerReport, fetchAttempts, fetchReportShares } from "@/lib/interview/server";
import { toTranscriptParts } from "@/lib/interview/transcript";
import type { Category } from "@/lib/interview/types";

// Must match apps/api/app/routers/answers.py's MAX_ATTEMPTS_PER_QUESTION.
const MAX_ATTEMPTS_PER_QUESTION = 5;

const CATEGORY_LABELS: Record<Category, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  situational: "Situational",
};

const RUBRIC_SECTION_LABELS: Record<Category, string> = {
  behavioral: "STAR structure",
  technical: "Technical assessment",
  situational: "Situational assessment",
};

export default async function ReportPage({ params }: { params: Promise<{ answerId: string }> }) {
  const { answerId } = await params;
  const report = await fetchAnswerReport(answerId).catch(() => undefined);

  if (!report) {
    return (
      <RecoveryState
        title={report === undefined ? "Could not load your report" : "Report not found"}
        description={
          report === undefined
            ? "Your data could not be loaded right now. Please try again."
            : "This report does not exist or is not associated with your account."
        }
        retry={report === undefined}
      />
    );
  }

  const { feedback } = report;
  const comparison = await fetchAttempts(answerId).catch(() => null);
  const shares = (await fetchReportShares(answerId).catch(() => null)) ?? [];
  const isRetry = report.attempt_number > 1;
  if (!hasCompleteFeedback(feedback)) {
    return (
      <RecoveryState
        title="Feedback unavailable"
        description="This report's feedback could not be loaded. Try again or return to your session history."
        retry
      />
    );
  }

  const strongestArea = strongestRubricArea(feedback.rubric);
  // Exactly one of these is ever set, enforced server-side (see hasCompleteFeedback) — a
  // behavioral answer gets a fact-preserving rewrite of the candidate's own answer, a
  // technical/situational one gets a fresh reference example that doesn't need to represent
  // their personal history.
  const isBehavioral = feedback.rubric.category === "behavioral";
  const improvedAnswer = feedback.rewritten_answer ?? feedback.reference_answer ?? "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">
          Question {report.question_number} of {report.question_count} ·{" "}
          {CATEGORY_LABELS[report.category]}
        </p>
        <a
          href="#report-next-steps"
          className="no-print text-lime inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          Jump to next steps
        </a>
        <h1 className="font-display text-text text-2xl font-bold text-balance">
          {report.question_text}
        </h1>
        <ExportReportButton />
      </div>

      {feedback.improvements[0] ? (
        <div className="border-lime/30 bg-lime/10 rounded-[var(--radius-tile)] border p-5">
          <h2 className="text-lime mb-2 text-sm font-semibold">Focus for your next answer</h2>
          <p className="text-text text-sm leading-relaxed">{feedback.improvements[0]}</p>
        </div>
      ) : null}
      {comparison ? <AttemptComparison comparison={comparison} /> : null}
      <ShareReportControl answerId={answerId} initialShares={shares} />
      <Card className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-8">
          <ScoreRing score={feedback.clarity} label="Clarity" />
          <div className="grid w-full grid-cols-2 gap-4 sm:w-auto sm:flex-1 sm:grid-cols-3">
            <Stat label="Filler words" value={report.filler_count} />
            <Stat label="Pace" value={Math.round(report.wpm)} unit="wpm" />
            <Stat label="Long pauses" value={report.long_pauses} />
          </div>
        </div>

        <details className="border-line border-t pt-6">
          <summary className="text-muted cursor-pointer text-sm font-medium">
            More delivery metrics
          </summary>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Words" value={report.word_count} />
            <Stat label="Filler rate" value={report.filler_rate_per_100_words} unit="/100w" />
            <Stat
              label="Longest pause"
              value={report.max_pause_s !== null ? report.max_pause_s.toFixed(1) : "—"}
              unit="s"
            />
            <Stat
              label="Avg pause"
              value={report.avg_pause_s !== null ? report.avg_pause_s.toFixed(1) : "—"}
              unit="s"
            />
          </div>
        </details>

        {report.transcription_quality_warning ? (
          <p className="bg-amber/15 text-text rounded-[var(--radius-tile)] px-4 py-3 text-sm">
            {report.transcription_quality_warning}
          </p>
        ) : null}

        {strongestArea ? (
          <p className="bg-lime/10 text-text rounded-[var(--radius-tile)] px-4 py-3 text-sm">
            <span className="text-lime font-medium">Nice work —</span> your{" "}
            <span className="font-medium">{strongestArea.label}</span> was the strongest part of
            this answer: {strongestArea.praise}. Keep leaning into that.
          </p>
        ) : null}

        {report.rambling ? (
          <p className="bg-amber/15 text-amber w-fit rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium">
            This answer could be more focused. Prioritize the key points and use the coaching below.
          </p>
        ) : null}

        {report.confidence_note ? (
          <p className="bg-amber/15 text-text rounded-[var(--radius-tile)] px-4 py-3 text-sm">
            {report.confidence_note}
          </p>
        ) : null}

        {report.delivery ? (
          <DeliveryCard
            heading="Delivery"
            items={report.delivery.items}
            advice={report.delivery.advice}
            footnote={
              report.delivery.voice_measured
                ? "Pitch, energy and volume are measured on your device while you speak; your audio is never saved. Delivery is separate from the content score above."
                : "Pitch, energy and volume were not measured for this answer. Delivery is separate from the content score."
            }
          />
        ) : null}

        {report.visual_delivery ? (
          <DeliveryCard
            heading="Visual delivery (camera coach)"
            items={report.visual_delivery.items}
            advice={report.visual_delivery.advice}
            footnote={report.visual_delivery.disclaimer}
          />
        ) : null}

        <div>
          <h2 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
            {RUBRIC_SECTION_LABELS[report.category]}
          </h2>
          <RubricBars items={rubricAreas(feedback.rubric)} />
        </div>

        <div>
          <h2 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
            Transcript
          </h2>
          <BeforeAfterToggle
            before={toTranscriptParts(report.transcript_parts)}
            after={[{ type: "added", text: improvedAnswer }]}
            afterLabel={isBehavioral ? "Your answer, improved" : "Reference answer"}
          />
        </div>

        {feedback.evidence.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
              From your answer
            </h2>
            <ul className="flex flex-col gap-2">
              {feedback.evidence.map((quote, index) => (
                <li key={index} className="border-line text-muted border-l-2 pl-3 text-sm italic">
                  &ldquo;{quote}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">What went well</h2>
          <ul className="flex flex-col gap-2">
            {feedback.strengths.map((strength, index) => (
              <li key={index} className="text-text flex gap-2 text-sm">
                <span className="text-mint" aria-hidden="true">
                  ✓
                </span>
                {strength}
              </li>
            ))}
          </ul>
        </div>

        {feedback.improvements.length > 1 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
              More ways to grow
            </h2>
            <ul className="flex flex-col gap-2">
              {feedback.improvements.slice(1).map((improvement, index) => (
                <li key={index} className="text-text flex gap-2 text-sm">
                  <span className="text-lime" aria-hidden="true">
                    →
                  </span>
                  {improvement}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {feedback.missing_information.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
              Missing from your answer
            </h2>
            <ul className="flex flex-col gap-2">
              {feedback.missing_information.map((item, index) => (
                <li key={index} className="text-muted flex gap-2 text-sm">
                  <span aria-hidden="true">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {feedback.consistency_notes && feedback.consistency_notes.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
              Possible recruiter follow-up
            </h2>
            <ul className="flex flex-col gap-3">
              {feedback.consistency_notes.map((note, index) => (
                <li
                  key={index}
                  className="bg-amber/15 text-text flex flex-col gap-2 rounded-[var(--radius-tile)] px-4 py-3 text-sm"
                >
                  <p>{note.message}</p>
                  <p className="text-muted text-xs">
                    In this answer: &ldquo;{note.answer_statement}&rdquo; &middot; On your resume:
                    &ldquo;{note.resume_statement}&rdquo;
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ClaimsList claims={report.claims ?? []} heading="Claims a recruiter may ask about" />

        {feedback.rambling_notes ? (
          <p className="text-muted text-sm">{feedback.rambling_notes}</p>
        ) : null}

        {!feedback.on_topic ? (
          <p className="text-coral text-sm">
            This answer may not have fully addressed the question asked.
          </p>
        ) : null}

        <div className="border-line border-t pt-6">
          <h2 className="text-muted mb-2 text-xs font-medium tracking-wide uppercase">
            Follow-up question
          </h2>
          <p className="text-text text-sm">{feedback.follow_up_question}</p>
        </div>

        <RetryAnswer
          report={report}
          attemptsUsed={comparison?.attempts.length ?? 1}
          maxAttempts={MAX_ATTEMPTS_PER_QUESTION}
        />

        {isRetry ? (
          <Link
            href={`/session/${report.session_id}/summary`}
            className="text-lime inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Back to your interview summary
          </Link>
        ) : (
          <ReportNextSteps
            sessionId={report.session_id}
            questionNumber={report.question_number}
            questionCount={report.question_count}
            sessionStatus={report.session_status}
            nextQuestion={report.next_question}
          />
        )}
      </Card>
    </div>
  );
}
