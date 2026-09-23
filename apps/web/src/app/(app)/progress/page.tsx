import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fetchProgress } from "@/lib/interview/server";
import { ROLE_OPTIONS } from "@/lib/interview/types";

const DIFFICULTY_TONE = { easy: "mint", medium: "amber", hard: "coral" } as const;

function roleName(slug: string): string {
  return ROLE_OPTIONS.find((option) => option.slug === slug)?.name ?? slug;
}

function formatAvg(value: number | null, digits = 0): string {
  return value === null ? "—" : value.toFixed(digits);
}

export default async function ProgressPage() {
  const progress = await fetchProgress();

  if (progress === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="text-text text-sm">Couldn&apos;t load your progress right now.</p>
          <p className="text-muted text-xs">Refresh the page to try again.</p>
        </Card>
      </div>
    );
  }

  if (progress.sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="font-display text-text text-xl font-bold">No sessions yet</h1>
          <p className="text-muted text-sm">
            Your progress will show up here once you&apos;ve answered a question in a mock
            interview.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">Your progress</p>
        <h1 className="font-display text-text text-2xl font-bold">Session history</h1>
      </div>

      <div className="flex flex-col gap-4">
        {progress.sessions.map((row) => (
          <Card key={row.session_id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-text text-sm font-medium">{roleName(row.role)}</span>
                <Badge tone={DIFFICULTY_TONE[row.difficulty]}>{row.difficulty}</Badge>
              </div>
              <span className="text-muted text-xs">
                {new Date(row.started_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Answers</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {row.answer_count}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Avg WPM</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {formatAvg(row.avg_wpm)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Avg fillers</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {formatAvg(row.avg_filler_count, 1)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Avg clarity</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {formatAvg(row.avg_clarity, 1)}/10
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Avg STAR</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {formatAvg(row.avg_star, 1)}/10
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
