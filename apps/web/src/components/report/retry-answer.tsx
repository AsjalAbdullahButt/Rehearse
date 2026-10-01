"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { createIdempotencyKey } from "@/lib/interview/pending-submission";
import type { AnswerReport } from "@/lib/interview/types";

const MAX_RETRY_SECONDS = 120;

type Phase = "idle" | "recording" | "uploading" | "error";

/** "Try again" on a report: records a fresh answer to the *same* question and submits it as a
 * retry of this answer. The original answer and its feedback are never replaced — the API stores
 * the retry as a new attempt and the new report shows the comparison. */
export function RetryAnswer({
  report,
  attemptsUsed,
  maxAttempts,
}: {
  report: AnswerReport;
  attemptsUsed: number;
  maxAttempts: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef(createIdempotencyKey());
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function submit(blob: Blob) {
    setPhase("uploading");
    const form = new FormData();
    form.set("session_id", report.session_id);
    form.set("session_question_id", report.session_question_id ?? "");
    form.set("retry_of_answer_id", report.original_answer_id ?? report.id);
    form.set("audio", blob, "answer.webm");
    try {
      const response = await fetch("/api/interview/answers", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: form,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setMessage(body?.error?.message ?? "Something went wrong. Please try again.");
        setPhase("error");
        return;
      }
      const retry = (await response.json()) as AnswerReport;
      router.push(`/report/${retry.id}`);
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
      setPhase("error");
    }
  }

  const recorder = useAudioRecorder((blob) => {
    void submit(blob);
  });

  useEffect(
    () => () => {
      if (autoStop.current) clearTimeout(autoStop.current);
    },
    [],
  );

  async function start() {
    setMessage(null);
    idempotencyKey.current = createIdempotencyKey();
    await recorder.start();
    setPhase("recording");
    autoStop.current = setTimeout(() => recorder.stop(), MAX_RETRY_SECONDS * 1000);
  }

  function stop() {
    if (autoStop.current) clearTimeout(autoStop.current);
    recorder.stop();
  }

  if (attemptsUsed >= maxAttempts) {
    return (
      <p className="text-muted text-sm">
        You have used all {maxAttempts} attempts on this question.
      </p>
    );
  }

  return (
    <section aria-labelledby="retry-heading" className="flex flex-col gap-3">
      <h2 id="retry-heading" className="text-text text-sm font-semibold">
        Try this question again
      </h2>
      <p className="text-muted text-sm">
        Apply the feedback above and answer once more. Your first answer is kept, and you will see
        exactly what changed. Retries do not change your skill scores.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {phase === "recording" ? (
          <Button onClick={stop}>Stop and submit</Button>
        ) : (
          <Button
            onClick={() => void start()}
            disabled={phase === "uploading" || recorder.isStarting}
          >
            {phase === "uploading"
              ? "Analyzing your new answer…"
              : phase === "error"
                ? "Try recording again"
                : "Record a new answer"}
          </Button>
        )}
        {phase === "recording" ? (
          <span role="status" className="text-coral text-sm">
            Recording — up to {MAX_RETRY_SECONDS / 60} minutes
          </span>
        ) : null}
      </div>
      {recorder.error ? (
        <p role="alert" className="text-coral text-sm">
          {recorder.error.message}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-coral text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
