import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-ink px-6 py-24 text-center">
      <span className="font-mono-metric text-sm tabular-nums text-muted">404</span>
      <h1 className="font-display text-3xl font-bold text-text">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] bg-lime px-6 text-sm font-medium text-lime-ink transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110"
      >
        Back to Rehearse
      </Link>
    </div>
  );
}
