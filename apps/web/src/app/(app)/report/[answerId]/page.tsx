import { notFound } from "next/navigation";

import { BeforeAfterToggle } from "@/components/report/before-after-toggle";
import { ScoreRing } from "@/components/report/score-ring";
import { StarBars } from "@/components/report/star-bars";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { fetchAnswerReport } from "@/lib/interview/server";
import { toTranscriptParts } from "@/lib/interview/transcript";

export default async function ReportPage({ params }: { params: Promise<{ answerId: string }> }) {
  const { answerId } = await params;
  const report = await fetchAnswerReport(answerId);

  if (!report) {
    notFound();
  }

  const { feedback } = report;
  const starScores = {
    s: feedback.star.situation,
    t: feedback.star.task,
    a: feedback.star.action,
    r: feedback.star.result,
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">Your report</p>
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

        {report.rambling ? (
          <p className="bg-amber/15 text-amber w-fit rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium">
            This answer ran long — aim for 1-2 minutes.
          </p>
        ) : null}

        <div>
          <h2 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
            STAR structure
          </h2>
          <StarBars scores={starScores} />
        </div>

        <div>
          <h2 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
            Transcript
          </h2>
          <BeforeAfterToggle
            before={toTranscriptParts(report.transcript_parts)}
            after={[{ type: "added", text: feedback.sample_answer }]}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">Tips</h2>
          <ul className="flex flex-col gap-2">
            {feedback.tips.map((tip, index) => (
              <li key={index} className="text-text flex gap-2 text-sm">
                <span className="text-lime" aria-hidden="true">
                  →
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

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
      </Card>
    </div>
  );
}
