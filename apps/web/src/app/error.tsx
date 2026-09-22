"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-ink px-6 py-24 text-center">
      <span className="font-mono-metric text-sm tabular-nums text-coral">Error</span>
      <h1 className="font-display text-3xl font-bold text-text">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        An unexpected error occurred. You can try again, and if it keeps happening let us know.
      </p>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
