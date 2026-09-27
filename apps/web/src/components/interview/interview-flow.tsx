"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { LiveCaption } from "@/components/interview/live-caption";
import { MicOrb } from "@/components/interview/mic-orb";
import { SessionSetupForm } from "@/components/interview/session-setup-form";
import { Waveform } from "@/components/interview/waveform";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useCountdown } from "@/hooks/use-countdown";
import { useLiveCaptions } from "@/hooks/use-live-captions";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import { useSilenceNudge } from "@/hooks/use-silence-nudge";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import {
  createIdempotencyKey,
  type PendingAnswerSubmission as PendingSubmission,
  stashPendingSubmission,
  takePendingSubmission,
} from "@/lib/interview/pending-submission";
import type {
  AnswerReport,
  InterviewSession,
  Role,
  SessionCreateInput,
  SessionQuestion,
  SessionSummary,
} from "@/lib/interview/types";
import { formatTime, getTimerTone } from "@/lib/utils";

type FlowState =
  | { stage: "setup" }
  | { stage: "starting" }
  | { stage: "ready"; session: InterviewSession; question: SessionQuestion }
  | {
      stage: "reviewing";
      session: InterviewSession;
      question: SessionQuestion;
      blob: Blob;
      idempotencyKey: string;
    }
  | { stage: "analyzing"; session: InterviewSession; question: SessionQuestion }
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

export function InterviewFlow({
  initialRole,
  resumeSessionId,
}: {
  initialRole?: Role;
  resumeSessionId?: string;
}) {
  const router = useRouter();
  const handleSessionExpiry = useSessionExpiry();
  // A session-expiry redirect to /sign-in and back unmounts and remounts this component — the
  // lazy initializer (not an effect) picks up a submission stashed just before that redirect,
  // offering it as a retry immediately instead of it silently vanishing.
  const [state, setState] = useState<FlowState>(() => {
    const stashed = takePendingSubmission();
    if (!stashed) return { stage: "setup" };
    return {
      stage: "error",
      message:
        "Your session expired before your recording finished uploading. Your recording is saved — retry the upload below.",
      retry: stashed,
    };
  });

  // Resuming a session (via /interview?session=<id>, e.g. the report page's "Continue
  // interview" link) fetches that session's current question once on mount, rather than
  // showing the setup form again.
  const resumeAttempted = useRef(false);
  useEffect(() => {
    if (!resumeSessionId || resumeAttempted.current || state.stage !== "setup") return;
    resumeAttempted.current = true;

    (async () => {
      const response = await fetch(
        `/api/interview/sessions/${encodeURIComponent(resumeSessionId)}`,
      );
      if (await handleSessionExpiry(response)) return;
      if (!response.ok) {
        setState({ stage: "error", message: (await parseApiError(response)).message });
        return;
      }
      const summary = (await response.json()) as SessionSummary;
      if (summary.session.status === "completed" || !summary.session.current_question) {
        router.replace(`/session/${summary.session.id}/summary`);
        return;
      }
      setState({
        stage: "ready",
        session: summary.session,
        question: summary.session.current_question,
      });
    })().catch(() => {
      setState({
        stage: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSessionId, state.stage]);

  async function handleSetupSubmit(value: SessionCreateInput) {
    setState({ stage: "starting" });
    try {
      const sessionResponse = await fetch("/api/interview/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (await handleSessionExpiry(sessionResponse)) return;
      if (!sessionResponse.ok) {
        setState({ stage: "error", message: (await parseApiError(sessionResponse)).message });
        return;
      }
      const session = (await sessionResponse.json()) as InterviewSession;
      if (!session.current_question) {
        setState({ stage: "error", message: "No questions are available for that role yet." });
        return;
      }

      setState({ stage: "ready", session, question: session.current_question });
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
    const { session, question, blob, idempotencyKey } = submission;
    setState({ stage: "analyzing", session, question });

    try {
      const formData = new FormData();
      formData.set("session_id", session.id);
      formData.set("session_question_id", question.id);
      formData.set("audio", blob, "answer.webm");

      const response = await fetch("/api/interview/answers", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: formData,
      });
      if (await handleSessionExpiry(response)) {
        // handleSessionExpiry is about to redirect to /sign-in, which unmounts this component
        // — stash the recording so the lazy initializer above can offer it as a retry once the
        // user is back, instead of it being silently discarded.
        stashPendingSubmission(submission);
        return;
      }
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

  // Stopping a recording moves to "reviewing", not straight to upload — the user gets to
  // listen back and re-record before anything is sent. Called by useAudioRecorder's internal
  // MediaRecorder "stop" event, not from a render/effect — an ordinary async event callback, so
  // setState here isn't the cascading-render pattern the newer react-hooks rules warn about.
  function handleStopped(blob: Blob) {
    if (state.stage !== "ready") return;
    const { session, question } = state;
    setState({
      stage: "reviewing",
      session,
      question,
      blob,
      idempotencyKey: createIdempotencyKey(),
    });
  }

  const recorder = useAudioRecorder(handleStopped);
  // Recording is derived from the recorder's own status rather than mirrored into a separate
  // FlowState stage — one less place for the two to fall out of sync, and it sidesteps ever
  // needing a setState-in-effect to keep them aligned.
  const isRecording = state.stage === "ready" && recorder.status === "recording";
  // recorder.status flips to "stopped" synchronously the instant .stop() is called, but the
  // MediaRecorder's own "stop" event (which triggers handleStopped → stage "reviewing") fires
  // asynchronously a moment later. Without this, the idle "Start recording" button would flash
  // back on screen during that gap.
  const isFinalizing = state.stage === "ready" && recorder.status === "stopped";

  function handleReRecord() {
    if (state.stage !== "reviewing") return;
    setState({ stage: "ready", session: state.session, question: state.question });
    void recorder.start();
  }

  const readyQuestionText = state.stage === "ready" ? state.question.text : null;
  useEffect(() => {
    if (!readyQuestionText) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(readyQuestionText);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    return () => window.speechSynthesis.cancel();
  }, [readyQuestionText]);

  const voiceActivity = useVoiceActivity(recorder.analyser, isRecording);
  const captions = useLiveCaptions(isRecording);

  const [showSilenceNudge, setShowSilenceNudge] = useState(false);
  const silenceNudge = useSilenceNudge(voiceActivity.isSpeaking, isRecording, () =>
    setShowSilenceNudge(true),
  );
  // Answering at all — or a fresh recording starting — clears a nudge from the previous pause;
  // guarded state updates during render (see use-countdown.ts/use-voice-activity.ts for the
  // same pattern), not effects.
  const [wasSpeakingForNudge, setWasSpeakingForNudge] = useState(voiceActivity.isSpeaking);
  if (voiceActivity.isSpeaking !== wasSpeakingForNudge) {
    setWasSpeakingForNudge(voiceActivity.isSpeaking);
    if (voiceActivity.isSpeaking) setShowSilenceNudge(false);
  }
  const [wasRecordingForNudge, setWasRecordingForNudge] = useState(isRecording);
  if (isRecording !== wasRecordingForNudge) {
    setWasRecordingForNudge(isRecording);
    if (isRecording) setShowSilenceNudge(false);
  }

  // Speaking the nudge aloud (not just showing it) is what makes this read as the interviewer
  // checking in, the same way the question itself is read aloud above.
  useEffect(() => {
    if (!showSilenceNudge) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(
      "Take your time. Would you like me to repeat the question?",
    );
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [showSilenceNudge]);

  const remaining = useCountdown(
    state.stage === "ready" ? state.session.answer_cap_s : 0,
    isRecording,
    () => recorder.stop(),
  );

  const reviewBlob = state.stage === "reviewing" ? state.blob : null;
  // Created during render (memoized on the blob's identity) rather than via setState-in-effect
  // — the effect below only unsubscribes from the browser's object-URL registry, it never
  // writes React state.
  const reviewAudioUrl = useMemo(
    () => (reviewBlob ? URL.createObjectURL(reviewBlob) : null),
    [reviewBlob],
  );
  useEffect(() => {
    return () => {
      if (reviewAudioUrl) URL.revokeObjectURL(reviewAudioUrl);
    };
  }, [reviewAudioUrl]);

  if (state.stage === "setup") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <SessionSetupForm
          initialRole={initialRole}
          isSubmitting={false}
          onSubmit={handleSetupSubmit}
        />
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
        <p className="text-muted text-sm" aria-live="polite">
          Transcribing your answer, evaluating your response, and preparing coaching feedback…
        </p>
      </div>
    );
  }

  if (state.stage === "reviewing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
        <Card className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
          <p className="text-muted text-xs font-medium tracking-wide uppercase">
            Question {state.session.current_question_number} of {state.session.question_count}
          </p>
          <h1 className="font-display text-text text-xl font-bold text-balance sm:text-2xl">
            {state.question.text}
          </h1>
          <p className="text-muted text-sm">Listen back before you submit.</p>
          {reviewAudioUrl ? <audio controls src={reviewAudioUrl} className="w-full" /> : null}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleReRecord}>
              Re-record
            </Button>
            <Button onClick={() => void submitAnswer(state)}>Submit answer</Button>
          </div>
        </Card>
      </div>
    );
  }

  // stage is "ready" from here
  const { question, session } = state;

  function handleRepeatQuestion() {
    setShowSilenceNudge(false);
    silenceNudge.reset();
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(question.text));
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Card className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <p className="text-muted text-xs font-medium tracking-wide uppercase">
          {isRecording
            ? "Recording"
            : `Question ${session.current_question_number} of ${session.question_count}`}
        </p>
        <h1 className="font-display text-text text-xl font-bold text-balance sm:text-2xl">
          {question.text}
        </h1>

        <MicOrb size={140} animate recording={isRecording} />

        {isRecording ? (
          <>
            <Waveform analyser={recorder.analyser} />
            <LiveCaption isSupported={captions.isSupported} transcript={captions.transcript} />
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

            {showSilenceNudge ? (
              <div
                role="status"
                className="bg-amber/15 flex flex-col items-center gap-3 rounded-[var(--radius-tile)] px-4 py-3"
              >
                <p className="text-amber text-sm">
                  Still there? Let me know if you missed the question.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={handleRepeatQuestion}>
                    Repeat the question
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowSilenceNudge(false)}>
                    I&apos;m still thinking
                  </Button>
                </div>
              </div>
            ) : null}

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
            <Button size="lg" disabled={recorder.isStarting} onClick={() => recorder.start()}>
              {recorder.isStarting ? "Requesting mic access…" : "Start recording"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
