import Link from "next/link";

import { BeforeAfterToggle } from "@/components/report/before-after-toggle";
import { RubricBars } from "@/components/report/rubric-bars";
import { ScoreRing } from "@/components/report/score-ring";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { hasCompleteFeedback } from "@/lib/interview/feedback";
import { rubricAreas, strongestRubricArea } from "@/lib/interview/rubric-insights";
import { fetchAnswerReport } from "@/lib/interview/server";
import { toTranscriptParts } from "@/lib/interview/transcript";
import type { Category } from "@/lib/interview/types";

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
  const report = await fetchAnswerReport(answerId);

  if (!report) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="font-display text-text text-xl font-bold">Report not found</h1>
          <p className="text-muted text-sm">
            This report doesn&apos;t exist, or it isn&apos;t associated with your account.
          </p>
        </Card>
      </div>
    );
  }

  const { feedback } = report;
  if (!hasCompleteFeedback(feedback)) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="font-display text-text text-xl font-bold">Feedback unavailable</h1>
          <p className="text-muted text-sm">
            This report&apos;s feedback is still processing or couldn&apos;t be loaded. Check back
            in a moment.
          </p>
        </Card>
      </div>
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
          Your report · {CATEGORY_LABELS[report.category]}
        </p>
        <h1 className="font-display text-text text-2xl font-bold text-balance">
          {report.question_text}
        </h1>
      </div>

      <Card className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-8">
          <ScoreRing score={feedback.clarity} label="Clarity" />
          <div className="grid flex-1 grid-cols-3 gap-6">
            <Stat label="Filler words" value={report.filler_count} />
            <Stat label="Pace" value={Math.round(report.wpm)} unit="wpm" />
            <Stat label="Long pauses" value={report.long_pauses} />
          </div>
        </div>

        <div className="border-line grid grid-cols-2 gap-4 border-t pt-6 sm:grid-cols-4">
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
            This answer ran long — aim for 1-2 minutes.
          </p>
        ) : null}

        {report.confidence_note ? (
          <p className="bg-amber/15 text-text rounded-[var(--radius-tile)] px-4 py-3 text-sm">
            {report.confidence_note}
          </p>
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

        <div className="flex flex-col gap-3">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">Ways to grow</h2>
          <ul className="flex flex-col gap-2">
            {feedback.improvements.map((improvement, index) => (
              <li key={index} className="text-text flex gap-2 text-sm">
                <span className="text-lime" aria-hidden="true">
                  →
                </span>
                {improvement}
              </li>
            ))}
          </ul>
        </div>

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

        <div className="border-line flex flex-col items-center gap-3 border-t pt-6 text-center">
          {report.session_status === "completed" || !report.next_question ? (
            <>
              <p className="text-muted text-sm">
                That was the last question — your session is complete.
              </p>
              <Link
                href={`/session/${report.session_id}/summary`}
                className="bg-lime text-lime-ink inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] px-6 text-sm font-medium transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110"
              >
                View session summary
              </Link>
            </>
          ) : (
            <>
              <p className="text-muted text-sm">
                Question {report.question_number} of {report.question_count} complete.
              </p>
              <Link
                href={`/interview?session=${report.session_id}`}
                className="bg-lime text-lime-ink inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] px-6 text-sm font-medium transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110"
              >
                Continue interview — Question {report.question_number + 1} of{" "}
                {report.question_count}
              </Link>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
