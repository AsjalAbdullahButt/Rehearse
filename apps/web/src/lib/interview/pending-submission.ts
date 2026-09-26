import type { InterviewSession, Question } from "@/lib/interview/types";

export interface PendingAnswerSubmission {
  session: InterviewSession;
  question: Question;
  timeCapS: number;
  blob: Blob;
  /** Generated once per recording (see `createIdempotencyKey`) and reused for every retry of
   * that same recording, so a lost-response retry replays the original request instead of the
   * API processing (and billing Groq for) the same answer twice. A re-record gets a new one. */
  idempotencyKey: string;
}

/** One per recording, not per request — call this exactly once when a recording is finalized
 * (see `handleStopped` in `InterviewFlow`) and carry the result on every retry of that same
 * blob. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

// Module-level, not React state: a session-expiry redirect to /sign-in and back unmounts and
// remounts InterviewFlow, which would otherwise lose the recorded Blob — the only place it
// ever lives, since audio is never written to disk or a URL (see use-audio-recorder.ts). This
// survives that round trip because it's a client-side route change within the same JS module
// registry, not a full page reload.
let pending: PendingAnswerSubmission | null = null;

export function stashPendingSubmission(submission: PendingAnswerSubmission): void {
  pending = submission;
}

/** Reads and clears the stash in one step, so a submission is only ever offered as a retry
 * once. */
export function takePendingSubmission(): PendingAnswerSubmission | null {
  const value = pending;
  pending = null;
  return value;
}
