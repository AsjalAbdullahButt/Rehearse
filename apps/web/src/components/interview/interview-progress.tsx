import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import type { Category } from "@/lib/interview/types";

const CATEGORY_LABELS: Record<Category, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  situational: "Situational",
};

/** "Question 4 of 10" with a bar of *completed* questions. The time hint is an upper bound
 * computed from the session's own answer cap — real answers usually finish sooner — so it is
 * phrased "up to", never as a prediction. */
export function InterviewProgress({
  current,
  total,
  answerCapS,
  category,
  title,
}: {
  current: number;
  total: number;
  answerCapS: number;
  category?: Category;
  title?: string;
}) {
  const remainingQuestions = Math.max(0, total - current + 1);
  const maxMinutes = Math.ceil((remainingQuestions * answerCapS) / 60);
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-text text-sm font-medium">
          Question {current} of {total}
          {title ? <span className="text-muted font-normal"> · {title}</span> : null}
        </p>
        <p className="text-muted text-xs">
          {remainingQuestions === 1 ? "Last question" : `Up to ${maxMinutes} min of answers left`}
        </p>
      </div>
      <ProgressBar
        value={current - 1}
        max={total}
        label="Interview progress"
        valueText={`Question ${current} of ${total}`}
      />
      {category ? (
        <div>
          <Badge tone="violet">{CATEGORY_LABELS[category]}</Badge>
        </div>
      ) : null}
    </div>
  );
}
