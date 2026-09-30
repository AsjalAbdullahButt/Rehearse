"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnswerPlayback } from "@/components/interview/answer-playback";
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
import { useSpeechVoices } from "@/hooks/use-speech-voices";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import {
  createIdempotencyKey,
  type PendingAnswerSubmission as PendingSubmission,
  stashPendingSubmission,
  takePendingSubmission,
} from "@/lib/interview/pending-submission";
import type {
  AnswerReport,
  Difficulty,
  Focus,
  InterviewSession,
  Profile,
  Role,
  SessionCreateInput,
  SessionQuestion,
  SessionSummary,
} from "@/lib/interview/types";
import { formatTime, getTimerTone } from "@/lib/utils";

// How long the "get ready" beat runs after pressing "Start recording" — long enough to take a
// breath, short enough not to feel like a delay.
const PREP_COUNTDOWN_S = 3;

type FlowState =
  | { stage: "setup" }
  | { stage: "starting" }
  // Shown once at the start of a fresh session (the first question only — see
  // handleSetupSubmit/the resume effect) so a bad mic is caught before an answer is wasted on
  // it, not on every question.
  | { stage: "mic-check"; session: InterviewSession; question: SessionQuestion }
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

/** The first question of a session is the only place a mic-check makes sense — resuming later in
 * an already-in-progress session means the mic was already exercised (this tab or another). */
function firstStageFor(question: SessionQuestion): "mic-check" | "ready" {
  return question.sequence_number === 1 ? "mic-check" : "ready";
}

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
  initialFocus,
  initialDifficulty,
  initialQuestionCount,
  initialAnswerCapS,
  resumeSessionId,
  profile,
}: {
  initialRole?: Role;
  initialFocus?: Focus;
  initialDifficulty?: Difficulty;
  initialQuestionCount?: number;
  /** From a "repeat this setup" link — overrides the profile's saved default time cap below. */
  initialAnswerCapS?: number;
  resumeSessionId?: string;
  profile: Profile | null;
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
        stage: firstStageFor(summary.session.current_question),
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

      setState({
        stage: firstStageFor(session.current_question),
        session,
        question: session.current_question,
      });
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

  // The mic-check stage reuses the same recorder to exercise the real getUserMedia/MediaRecorder
  // path, but its recording is a throwaway level test, never an answer — this ref (not state, so
  // it can't be stale by the time the recorder's real, asynchronous "stop" event fires) tells
  // handleStopped to discard that blob instead of treating it as a submittable answer.
  const micCheckActiveRef = useRef(false);

  // handleStopped (below) needs to call recorder.reset() after a discarded mic-check recording,
  // but `recorder` is itself created from `useAudioRecorder(handleStopped)` — a ref updated via
  // a no-deps effect (the same pattern useAudioRecorder's own onStoppedRef uses internally)
  // breaks that cycle without referencing `recorder` before it's declared.
  const recorderResetRef = useRef<() => void>(() => undefined);

  // Stopping a recording moves to "reviewing", not straight to upload — the user gets to
  // listen back and re-record before anything is sent. Called by useAudioRecorder's internal
  // MediaRecorder "stop" event, not from a render/effect — an ordinary async event callback, so
  // setState here isn't the cascading-render pattern the newer react-hooks rules warn about.
  function handleStopped(blob: Blob) {
    if (micCheckActiveRef.current) {
      micCheckActiveRef.current = false;
      // Without this, recorder.status stays "stopped" from the mic-check's own throwaway
      // recording — the very next render (now on stage "ready" for the real question) would
      // read that as `isFinalizing` and get stuck showing "Finishing up…" forever, with no
      // "Start recording" button ever appearing. This was a real, confirmed bug: the mic-check
      // left the recorder unable to ever start the actual answer recording.
      recorderResetRef.current();
      return;
    }
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
  useEffect(() => {
    recorderResetRef.current = recorder.reset;
  });
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
    // Same class of stale-status gap the mic-check fix above addresses: recorder.status is
    // still "stopped" from the recording that led here, and start() only flips it to
    // "recording" once getUserMedia() resolves — without this reset, the instant this enters
    // "ready" it would briefly (mis)render as `isFinalizing` ("Finishing up…") instead of
    // "Requesting mic access…" while the new recording spins up.
    recorder.reset();
    setState({ stage: "ready", session: state.session, question: state.question });
    void recorder.start();
  }

  function handleMicCheckContinue() {
    if (state.stage !== "mic-check") return;
    if (recorder.status === "recording") recorder.stop();
    setState({ stage: "ready", session: state.session, question: state.question });
  }

  // Resolves the user's saved interviewer-voice preference (Settings) to a live
  // SpeechSynthesisVoice, once the browser's async voice list has loaded — shared by every place
  // this flow speaks aloud (the question itself, the silence nudge, "repeat the question"), so
  // Settings' voice/rate controls actually take effect here instead of only being saved and
  // never read.
  const voices = useSpeechVoices();
  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = voices.find((candidate) => candidate.name === profile?.voice_name);
      if (voice) utterance.voice = voice;
      utterance.rate = profile?.voice_rate ?? 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [voices, profile?.voice_name, profile?.voice_rate],
  );

  const readyQuestionText = state.stage === "ready" ? state.question.text : null;
  useEffect(() => {
    if (!readyQuestionText) return;
    speak(readyQuestionText);
    return () => window.speechSynthesis?.cancel();
    // `speak` is intentionally a dependency here (unlike a typical stable callback) — if the
    // browser's async voice list finishes loading just after this question was already spoken in
    // the default voice, re-running once with the now-resolved preferred voice is correct, not a
    // bug to suppress.
  }, [readyQuestionText, speak]);

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
    speak("Take your time. Would you like me to repeat the question?");
  }, [showSilenceNudge, speak]);

  const remaining = useCountdown(
    state.stage === "ready" ? state.session.answer_cap_s : 0,
    isRecording,
    () => recorder.stop(),
  );

  // A short "get ready" beat between pressing Start and the mic actually going live — every
  // question, not just the first (that's the mic-check's job) — so the recording clock doesn't
  // start the instant a still-orienting candidate clicks the button.
  const [isPreparing, setIsPreparing] = useState(false);
  const prepRemaining = useCountdown(PREP_COUNTDOWN_S, isPreparing, () => {
    setIsPreparing(false);
    void recorder.start();
  });

  if (state.stage === "setup") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <SessionSetupForm
          initialRole={initialRole}
          initialFocus={initialFocus}
          initialDifficulty={initialDifficulty}
          initialQuestionCount={initialQuestionCount}
          initialAnswerCapS={initialAnswerCapS ?? profile?.answer_cap_s}
          initialCandidateBackground={profile?.candidate_background}
          initialSkills={profile?.skills}
          initialYearsExperience={profile?.years_experience}
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

  if (state.stage === "mic-check") {
    const micIsLive = recorder.status === "recording";

    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
          <h1 className="font-display text-text text-xl font-bold">Check your microphone</h1>
          <p className="text-muted text-sm">
            Say something out loud — you should see the bars move below. This only happens once per
            session.
          </p>
          <MicOrb size={100} recording={micIsLive} />
          {micIsLive ? <Waveform analyser={recorder.analyser} /> : null}
          {recorder.error ? (
            <p role="alert" className="text-coral text-sm">
              {recorder.error.message}
            </p>
          ) : null}
          <div className="flex gap-3">
            {!micIsLive ? (
              <Button
                variant="secondary"
                disabled={recorder.isStarting}
                onClick={() => {
                  micCheckActiveRef.current = true;
                  void recorder.start();
                }}
              >
                {recorder.isStarting
                  ? "Requesting mic access…"
                  : recorder.error
                    ? "Try again"
                    : "Test my mic"}
              </Button>
            ) : null}
            <Button variant={micIsLive ? "primary" : "ghost"} onClick={handleMicCheckContinue}>
              {micIsLive ? "Sounds good — continue" : "Skip check"}
            </Button>
          </div>
        </Card>
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
          <AnswerPlayback blob={state.blob} />
          {!voiceActivity.hasSpokenAtAll ? (
            <p role="alert" className="text-amber max-w-sm text-sm">
              We didn&apos;t detect any voice in that recording — it may be silent. Check the
              playback above, and re-record if you can&apos;t hear yourself.
            </p>
          ) : null}
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

        <MicOrb
          size={140}
          animate
          recording={isRecording}
          voiceActive={isRecording ? voiceActivity.isSpeaking : undefined}
        />

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
        ) : isPreparing ? (
          <p
            className="font-mono-metric text-text text-3xl tabular-nums"
            aria-live="assertive"
            aria-label={`Recording starts in ${prepRemaining} second${prepRemaining === 1 ? "" : "s"}`}
          >
            {prepRemaining > 0 ? prepRemaining : "Go!"}
          </p>
        ) : (
          <>
            {recorder.error ? (
              <p role="alert" className="text-coral max-w-xs text-sm">
                {recorder.error.message}
              </p>
            ) : null}
            <Button size="lg" disabled={recorder.isStarting} onClick={() => setIsPreparing(true)}>
              {recorder.isStarting ? "Requesting mic access…" : "Start recording"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
