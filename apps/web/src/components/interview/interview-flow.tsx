"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MicOrb } from "@/components/interview/mic-orb";
import { RolePicker, type RolePickerValue } from "@/components/interview/role-picker";
import { Waveform } from "@/components/interview/waveform";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useCountdown } from "@/hooks/use-countdown";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import type { AnswerReport, InterviewSession, Question, Role } from "@/lib/interview/types";
import { formatTime, getTimerTone } from "@/lib/utils";

interface PendingSubmission {
  session: InterviewSession;
  question: Question;
  timeCapS: number;
  blob: Blob;
}

type FlowState =
  | { stage: "setup" }
  | { stage: "starting" }
  | { stage: "ready"; session: InterviewSession; question: Question; timeCapS: number }
  | { stage: "analyzing"; session: InterviewSession; question: Question }
  // `retry` is only set for a failed upload (the recording still exists and can be resent);
  // a setup-time failure (e.g. session creation) has nothing to retry but "start over".
  | { stage: "error"; message: string; retry?: PendingSubmission };

interface ParsedApiError {
  message: string;
  code: string | null;
}

async function parseApiError(response: Response): Promise<ParsedApiError> {
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  return {
    message: body?.error?.message ?? "Something went wrong. Please try again.",
    code: body?.error?.code ?? null,
  };
}

export function InterviewFlow({ initialRole }: { initialRole?: Role }) {
  const router = useRouter();
  const handleSessionExpiry = useSessionExpiry();
  const [state, setState] = useState<FlowState>({ stage: "setup" });

  async function handleRoleSubmit(value: RolePickerValue) {
    setState({ stage: "starting" });
    try {
      const sessionResponse = await fetch("/api/interview/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: value.role, difficulty: value.difficulty }),
      });
      if (await handleSessionExpiry(sessionResponse)) return;
      if (!sessionResponse.ok) {
        setState({ stage: "error", message: (await parseApiError(sessionResponse)).message });
        return;
      }
      const session = (await sessionResponse.json()) as InterviewSession;

      const query = new URLSearchParams({ role: value.role, difficulty: value.difficulty });
      const questionsResponse = await fetch(`/api/interview/questions?${query.toString()}`);
      if (await handleSessionExpiry(questionsResponse)) return;
      if (!questionsResponse.ok) {
        setState({ stage: "error", message: (await parseApiError(questionsResponse)).message });
        return;
      }
      const questions = (await questionsResponse.json()) as Question[];
      if (questions.length === 0) {
        setState({ stage: "error", message: "No questions are available for that role yet." });
        return;
      }
      const question = questions[Math.floor(Math.random() * questions.length)]!;

      setState({ stage: "ready", session, question, timeCapS: value.timeCapS });
    } catch {
      setState({
        stage: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    }
  }

  // Shared by the initial submit and a retry after a failed upload — a retry resends the same
  // recording rather than discarding it, since the user's answer must survive a transient
  // network/STT/LLM failure, not force a full re-record.
  async function submitAnswer(submission: PendingSubmission) {
    const { session, question, timeCapS, blob } = submission;
    setState({ stage: "analyzing", session, question });

    try {
      const formData = new FormData();
      formData.set("session_id", session.id);
      formData.set("question_id", question.id);
      formData.set("time_cap_s", String(timeCapS));
      formData.set("audio", blob, "answer.webm");

      const response = await fetch("/api/interview/answers", { method: "POST", body: formData });
      if (await handleSessionExpiry(response)) return;
      if (!response.ok) {
        const { message, code } = await parseApiError(response);
        // A rate limit (daily cap or burst) won't clear by immediately retrying the same
        // request — offering "Retry upload" here would just trip it again.
        const retry = code === "rate_limited" ? undefined : submission;
        setState({ stage: "error", message, retry });
        return;
      }

      const report = (await response.json()) as AnswerReport;
      router.push(`/report/${report.id}`);
    } catch {
      setState({
        stage: "error",
        message: "Couldn't reach the server. Your recording is saved — try again.",
        retry: submission,
      });
    }
  }

  // Called by useAudioRecorder's internal MediaRecorder "stop" event, not from a render/effect
  // — an ordinary async event callback, so setState here isn't the cascading-render pattern
  // the newer react-hooks rules warn about.
  async function handleStopped(blob: Blob) {
    if (state.stage !== "ready") return;
    const { session, question, timeCapS } = state;
    await submitAnswer({ session, question, timeCapS, blob });
  }

  const recorder = useAudioRecorder(handleStopped);
  // Recording is derived from the recorder's own status rather than mirrored into a separate
  // FlowState stage — one less place for the two to fall out of sync, and it sidesteps ever
  // needing a setState-in-effect to keep them aligned.
  const isRecording = state.stage === "ready" && recorder.status === "recording";
  // recorder.status flips to "stopped" synchronously the instant .stop() is called, but the
  // MediaRecorder's own "stop" event (which triggers handleStopped → stage "analyzing") fires
  // asynchronously a moment later. Without this, the idle "Start recording" button would flash
  // back on screen during that gap.
  const isFinalizing = state.stage === "ready" && recorder.status === "stopped";

  const readyQuestionText = state.stage === "ready" ? state.question.text : null;
  useEffect(() => {
    if (!readyQuestionText) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(readyQuestionText);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    return () => window.speechSynthesis.cancel();
  }, [readyQuestionText]);

  const remaining = useCountdown(state.stage === "ready" ? state.timeCapS : 0, isRecording, () =>
    recorder.stop(),
  );

  if (state.stage === "setup") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <RolePicker initialRole={initialRole} isSubmitting={false} onSubmit={handleRoleSubmit} />
      </div>
    );
  }

  if (state.stage === "starting") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
        <MicOrb size={100} animate />
        <p className="text-muted text-sm">Preparing your question…</p>
      </div>
    );
  }

  if (state.stage === "error") {
    const { retry } = state;
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="flex max-w-sm flex-col items-center gap-4 text-center">
          <p role="alert" className="text-text text-sm">
            {state.message}
          </p>
          <div className="flex gap-3">
            {retry ? <Button onClick={() => void submitAnswer(retry)}>Retry upload</Button> : null}
            <Button
              variant={retry ? "secondary" : "primary"}
              onClick={() => setState({ stage: "setup" })}
            >
              {retry ? "Start over" : "Try again"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (state.stage === "analyzing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
        <MicOrb size={100} animate />
        <p className="text-muted text-sm">Analyzing your answer…</p>
      </div>
    );
  }

  // stage is "ready" from here
  const { question } = state;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Card className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">
          {isRecording ? "Recording" : "Your question"}
        </p>
        <h1 className="font-display text-text text-xl font-bold text-balance sm:text-2xl">
          {question.text}
        </h1>

        <MicOrb size={140} animate recording={isRecording} />

        {isRecording ? (
          <>
            <Waveform analyser={recorder.analyser} />
            <span className="font-mono-metric text-2xl tabular-nums">
              <span className={getTimerTone(remaining)}>{formatTime(remaining)}</span>
            </span>
            <span aria-live="polite" className="sr-only">
              {remaining === 30
                ? "30 seconds remaining."
                : remaining === 10
                  ? "10 seconds remaining."
                  : remaining === 0
                    ? "Time's up."
                    : ""}
            </span>
            <Button variant="secondary" onClick={() => recorder.stop()}>
              Stop recording
            </Button>
          </>
        ) : isFinalizing ? (
          <p className="text-muted text-sm">Finishing up…</p>
        ) : (
          <>
            {recorder.error ? (
              <p role="alert" className="text-coral max-w-xs text-sm">
                {recorder.error.message}
              </p>
            ) : null}
            <Button size="lg" onClick={() => recorder.start()}>
              Start recording
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
