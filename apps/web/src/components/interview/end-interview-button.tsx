"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useSessionExpiry } from "@/hooks/use-session-expiry";

/** Explicitly ends an unfinished interview. Two steps on purpose: ending is permanent (the
 * remaining questions are never asked and the session is labelled as ended early, not
 * complete), and answered questions, scores and reports are all kept. */
export function EndInterviewButton({
  sessionId,
  label = "End this interview",
}: {
  sessionId: string;
  label?: string;
}) {
  const router = useRouter();
  const handleSessionExpiry = useSessionExpiry();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/interview/sessions/${encodeURIComponent(sessionId)}/end`, {
        method: "POST",
      });
      if (await handleSessionExpiry(response)) return;
      // 409 means it already finished (another tab, or the last answer just landed): refreshing
      // shows the real state, which is what the person wanted to know.
      if (response.ok || response.status === 409) {
        router.refresh();
        return;
      }
      setError("Could not end the interview. Please try again.");
    } catch {
      setError("Could not reach the server. The interview has not been ended.");
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Confirm ending the interview"
      className="border-line flex w-full max-w-sm flex-col gap-3 rounded-[var(--radius-tile)] border p-4 text-left"
    >
      <p className="text-text text-sm">
        End this interview now? The questions you have not answered will not be asked. Your answers
        and feedback so far are kept.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void end()} disabled={pending}>
          {pending ? "Ending…" : "Yes, end it"}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
          Keep going
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-coral text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
