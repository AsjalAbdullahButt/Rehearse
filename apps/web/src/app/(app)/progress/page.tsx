import Link from "next/link";
import { ProgressView } from "@/components/progress/progress-view";
import { RecoveryState } from "@/components/ui/recovery-state";
import { fetchProgress } from "@/lib/interview/server";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const parsed = Number(query.page ?? 1);
  const page = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 10000 ? parsed : 1;
  const progress = await fetchProgress(page).catch(() => null);
  if (!progress)
    return (
      <RecoveryState
        title="We couldn’t load your progress"
        description="Your sessions are safe — we just couldn’t reach them right now. Please try again."
        retry
      />
    );
  if (!progress.sessions.length && page === 1)
    return (
      <RecoveryState
        title="No sessions yet"
        description="Practice your first interview and Rehearse will begin tracking your performance."
      />
    );
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-2">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">Your progress</p>
        <h1 className="font-display text-text text-2xl font-bold">Session history</h1>
        <p className="text-muted text-sm">
          Charts and role filters cover the sessions on this page. Open a summary to review or
          resume an interview.
        </p>
      </div>
      <ProgressView key={page} sessions={progress.sessions} />
      <nav
        aria-label="Session history pages"
        className="border-line flex flex-wrap items-center justify-between gap-4 border-t pt-4"
      >
        {page > 1 ? (
          <Link
            href={`/progress?page=${page - 1}`}
            className="text-lime inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Newer sessions
          </Link>
        ) : (
          <span />
        )}
        <span className="text-muted text-sm">Page {page}</span>
        {progress.sessions.length === 20 ? (
          <Link
            href={`/progress?page=${page + 1}`}
            className="text-lime inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Older sessions
          </Link>
        ) : (
          <span className="text-muted text-sm">End of history</span>
        )}
      </nav>
    </div>
  );
}
