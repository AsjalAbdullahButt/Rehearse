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
    <div className="bg-ink flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span className="font-mono-metric text-coral text-sm tabular-nums">Error</span>
      <h1 className="font-display text-text text-3xl font-bold">Something went wrong</h1>
      <p className="text-muted max-w-sm text-sm">
        An unexpected error occurred. You can try again, and if it keeps happening let us know.
      </p>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
