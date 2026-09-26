import { beforeEach, describe, expect, it } from "vitest";

import {
  stashPendingSubmission,
  takePendingSubmission,
  type PendingAnswerSubmission,
} from "./pending-submission";

function fakeSubmission(): PendingAnswerSubmission {
  return {
    session: {
      id: "s1",
      role: "backend",
      difficulty: "medium",
    } as PendingAnswerSubmission["session"],
    question: { id: "q1", text: "Tell me about a time..." } as PendingAnswerSubmission["question"],
    timeCapS: 120,
    blob: new Blob(["fake-audio"], { type: "audio/webm" }),
  };
}

describe("pending-submission stash", () => {
  beforeEach(() => {
    // Drain any leftover stash from a previous test.
    takePendingSubmission();
  });

  it("returns null when nothing has been stashed", () => {
    expect(takePendingSubmission()).toBeNull();
  });

  it("returns the stashed submission, blob included, after a session-expiry redirect and back", () => {
    const submission = fakeSubmission();
    stashPendingSubmission(submission);

    const taken = takePendingSubmission();

    expect(taken).toBe(submission);
    expect(taken?.blob).toBe(submission.blob);
  });

  it("only offers a stashed submission once", () => {
    stashPendingSubmission(fakeSubmission());

    expect(takePendingSubmission()).not.toBeNull();
    expect(takePendingSubmission()).toBeNull();
  });
});
