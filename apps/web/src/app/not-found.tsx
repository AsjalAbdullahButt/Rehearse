import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-ink flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span className="font-mono-metric text-muted text-sm tabular-nums">404</span>
      <h1 className="font-display text-text text-3xl font-bold">Page not found</h1>
      <p className="text-muted max-w-sm text-sm">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="bg-lime text-lime-ink inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] px-6 text-sm font-medium transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110"
      >
        Back to Rehearse
      </Link>
    </div>
  );
}
