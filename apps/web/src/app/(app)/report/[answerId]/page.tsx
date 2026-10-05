import Link from "next/link";

import { AnswerComparison } from "@/components/report/answer-comparison";
import { AttemptComparison } from "@/components/report/attempt-comparison";
import { ClaimsList } from "@/components/report/claims-list";
import { DeliveryCard } from "@/components/report/delivery-card";
import { ExportReportButton } from "@/components/report/export-report-button";
import { ReportNav, ReportSection } from "@/components/report/report-section";
import { ReportNextSteps } from "@/components/report/report-next-steps";
import { RetryAnswer } from "@/components/report/retry-answer";
import { RubricBars } from "@/components/report/rubric-bars";
import { ScoreRing } from "@/components/report/score-ring";
import { ShareReportControl } from "@/components/report/share-report-control";
import { RecoveryState } from "@/components/ui/recovery-state";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Stat } from "@/components/ui/stat";
import { hasCompleteFeedback } from "@/lib/interview/feedback";
import { rubricAreas, strongestRubricArea } from "@/lib/interview/rubric-insights";
import { fetchAnswerReport, fetchAttempts, fetchReportShares } from "@/lib/interview/server";
import { toTranscriptParts } from "@/lib/interview/transcript";
import type { Category } from "@/lib/interview/types";
import { scoreBandFromTen } from "@/lib/score-band";

// Must match apps/api/app/routers/answers.py's MAX_ATTEMPTS_PER_QUESTION.
const MAX_ATTEMPTS_PER_QUESTION = 5;

// Past this many words the transcript comparison starts collapsed so the page stays scannable.
const LONG_TRANSCRIPT_WORDS = 150;

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
        title={report === undefined ? "We couldn’t load your report" : "Report not found"}
        description={
          report === undefined
            ? "Your report is safe — we just couldn’t reach it right now. Please try again."
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

  const areas = rubricAreas(feedback.rubric);
  const strongestArea = strongestRubricArea(feedback.rubric);
  const contentScore =
    areas.length > 0
      ? Math.round((areas.reduce((sum, area) => sum + area.score, 0) / areas.length) * 10) / 10
      : null;
  // Exactly one of these is ever set, enforced server-side (see hasCompleteFeedback) — a
  // behavioral answer gets a fact-preserving rewrite of the candidate's own answer, a
  // technical/situational one gets a fresh reference example that doesn't need to represent
  // their personal history.
  const isBehavioral = feedback.rubric.category === "behavioral";
  const isTyped = report.input_mode === "text";
  const improvedAnswer = feedback.rewritten_answer ?? feedback.reference_answer ?? "";
  const moreImprovements = feedback.improvements.slice(1);
  const hasGrowthColumn = moreImprovements.length > 0 || feedback.missing_information.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-3">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">
          Question {report.question_number} of {report.question_count} ·{" "}
          {CATEGORY_LABELS[report.category]}
          {isRetry ? ` · Attempt ${report.attempt_number}` : ""}
        </p>
        <h1 className="font-display text-text text-2xl font-bold text-balance sm:text-3xl">
          {report.question_text}
        </h1>
        <div className="no-print flex flex-wrap items-center gap-3">
          <ShareReportControl answerId={answerId} initialShares={shares} />
          <ExportReportButton />
        </div>
        <ReportNav />
      </header>

      {comparison ? <AttemptComparison comparison={comparison} /> : null}

      <ReportSection
        id="summary"
        title="Summary"
        description="How this answer came across, based on the evaluation of what you said."
      >
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={feedback.clarity} label="Clarity" />
            <ScoreBadge band={scoreBandFromTen(feedback.clarity)} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {contentScore !== null ? (
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Content score</span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono-metric text-text text-2xl tabular-nums">
                    {contentScore}
                    <span className="text-muted text-sm">/10</span>
                  </span>
                  <ScoreBadge band={scoreBandFromTen(contentScore)} />
                </div>
                <p className="text-muted text-xs">
                  The average of the {RUBRIC_SECTION_LABELS[report.category].toLowerCase()} areas
                  below. Clarity is how clearly you got your point across.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {feedback.improvements[0] ? (
          <div className="border-lime/30 bg-lime/10 rounded-[var(--radius-tile)] border p-5">
            <h3 className="text-lime mb-2 text-sm font-semibold">Focus for your next answer</h3>
            <p className="text-text text-sm leading-relaxed">{feedback.improvements[0]}</p>
          </div>
        ) : null}

        {strongestArea ? (
          <p className="bg-lime/10 text-text rounded-[var(--radius-tile)] px-4 py-3 text-sm">
            <span className="text-lime font-medium">Nice work —</span> your{" "}
            <span className="font-medium">{strongestArea.label}</span> was the strongest part of
            this answer: {strongestArea.praise}. Keep leaning into that.
          </p>
        ) : null}

        {report.transcription_quality_warning ? (
          <p className="bg-amber/15 text-text rounded-[var(--radius-tile)] px-4 py-3 text-sm">
            {report.transcription_quality_warning}
          </p>
        ) : null}

        {report.rambling ? (
          <p className="bg-amber/15 text-text w-fit rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium">
            This answer could be more focused. Prioritize the key points and use the coaching below.
          </p>
        ) : null}

        {!feedback.on_topic ? (
          <p className="text-coral text-sm">
            This answer may not have fully addressed the question asked.
          </p>
        ) : null}
      </ReportSection>

      <ReportSection id="breakdown" title="Breakdown">
        <div>
          <h3 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
            {RUBRIC_SECTION_LABELS[report.category]}
          </h3>
          <RubricBars items={areas} />
        </div>

        <div className={hasGrowthColumn ? "grid gap-6 md:grid-cols-2" : ""}>
          <div className="flex flex-col gap-3">
            <h3 className="text-text text-sm font-semibold">What went well</h3>
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

          {hasGrowthColumn ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-text text-sm font-semibold">Needs improvement</h3>
              <ul className="flex flex-col gap-2">
                {moreImprovements.map((improvement, index) => (
                  <li key={index} className="text-text flex gap-2 text-sm">
                    <span className="text-lime" aria-hidden="true">
                      →
                    </span>
                    {improvement}
                  </li>
                ))}
                {feedback.missing_information.map((item, index) => (
                  <li key={`missing-${index}`} className="text-muted flex gap-2 text-sm">
                    <span aria-hidden="true">·</span>
                    <span>
                      <span className="sr-only">Missing: </span>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
              {feedback.missing_information.length > 0 ? (
                <p className="text-muted text-xs">
                  Items marked with a dot were missing from your answer.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {feedback.rambling_notes ? (
          <p className="text-muted text-sm">{feedback.rambling_notes}</p>
        ) : null}
      </ReportSection>

      <ReportSection
        id="answer"
        title="Your answer"
        description="Compare what you said with a stronger approach."
      >
        <details open={report.word_count <= LONG_TRANSCRIPT_WORDS}>
          <summary className="text-text focus-visible:outline-lime mb-4 min-h-11 cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
            Transcript and {isBehavioral ? "improved answer" : "reference answer"} (
            {report.word_count} words)
          </summary>
          <AnswerComparison
            yours={toTranscriptParts(report.transcript_parts)}
            improved={improvedAnswer}
            improvedLabel={isBehavioral ? "Your answer, improved" : "Reference answer"}
            improvedHint={
              isBehavioral
                ? "Your own answer, tightened — same facts, clearer structure."
                : "An example of a strong answer. Use it for structure, not to memorize."
            }
          />
        </details>

        {feedback.evidence.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-text text-sm font-semibold">From your answer</h3>
            <ul className="flex flex-col gap-2">
              {feedback.evidence.map((quote, index) => (
                <li key={index} className="border-line text-muted border-l-2 pl-3 text-sm italic">
                  &ldquo;{quote}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <h3 className="text-text text-sm font-semibold">Follow-up question</h3>
          <p className="text-muted text-sm">{feedback.follow_up_question}</p>
        </div>
      </ReportSection>

      <ReportSection id="delivery" title="Pace and delivery">
        {isTyped ? (
          <p className="text-muted text-sm">
            You typed this answer, so pace, pauses and spoken delivery weren&apos;t measured. Answer
            by voice to get that coaching.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="Filler words" value={report.filler_count} />
              <Stat label="Pace" value={Math.round(report.wpm)} unit="wpm" />
              <Stat label="Long pauses" value={report.long_pauses} />
            </div>

            <details>
              <summary className="text-muted focus-visible:outline-lime min-h-11 cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2">
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
          </>
        )}

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
      </ReportSection>

      <ReportSection id="next-steps" title="Next steps">
        {feedback.consistency_notes && feedback.consistency_notes.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-text text-sm font-semibold">Possible recruiter follow-up</h3>
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
      </ReportSection>
    </div>
  );
}
