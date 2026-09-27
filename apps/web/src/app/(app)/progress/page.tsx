import { ProgressView } from "@/components/progress/progress-view";
import { Card } from "@/components/ui/card";
import { fetchProgress } from "@/lib/interview/server";

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

      <ProgressView sessions={progress.sessions} />
    </div>
  );
}
