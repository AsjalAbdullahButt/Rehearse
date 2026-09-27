import { describe, expect, it } from "vitest";

import { hasCompleteFeedback } from "./feedback";
import type { FeedbackReport } from "./types";

function completeBehavioralFeedback(): FeedbackReport {
  return {
    rubric: { category: "behavioral", situation: 7, task: 7, action: 8, result: 7 },
    clarity: 8,
    on_topic: true,
    strengths: ["Clear structure."],
    improvements: ["Add more detail."],
    evidence: [],
    rambling_notes: "",
    rewritten_answer: "A cleaned-up version of the candidate's own answer.",
    reference_answer: null,
    missing_information: [],
    follow_up_question: "What would you do differently?",
  };
}

function completeTechnicalFeedback(): FeedbackReport {
  return {
    rubric: { category: "technical", correctness: 8, depth: 7, tradeoffs: 6, communication: 8 },
    clarity: 8,
    on_topic: true,
    strengths: ["Correct approach."],
    improvements: ["Discuss tradeoffs more."],
    evidence: [],
    rambling_notes: "",
    rewritten_answer: null,
    reference_answer: "A fresh example answer.",
    missing_information: [],
    follow_up_question: "How would you scale this further?",
  };
}

describe("hasCompleteFeedback", () => {
  it("accepts a complete behavioral feedback object (rewritten_answer set)", () => {
    expect(hasCompleteFeedback(completeBehavioralFeedback())).toBe(true);
  });

  it("accepts a complete technical feedback object (reference_answer set)", () => {
    expect(hasCompleteFeedback(completeTechnicalFeedback())).toBe(true);
  });

  it("rejects null", () => {
    expect(hasCompleteFeedback(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(hasCompleteFeedback(undefined)).toBe(false);
  });

  it("rejects a feedback object with a null rubric", () => {
    const feedback = {
      ...completeBehavioralFeedback(),
      rubric: null as unknown as FeedbackReport["rubric"],
    };
    expect(hasCompleteFeedback(feedback)).toBe(false);
  });

  it("rejects a feedback object with neither rewritten_answer nor reference_answer", () => {
    const feedback = { ...completeBehavioralFeedback(), rewritten_answer: null };
    expect(hasCompleteFeedback(feedback)).toBe(false);
  });

  it("rejects a feedback object with a non-array strengths field", () => {
    const feedback = { ...completeBehavioralFeedback(), strengths: null as unknown as string[] };
    expect(hasCompleteFeedback(feedback)).toBe(false);
  });

  it("rejects a feedback object with a non-array improvements field", () => {
    const feedback = {
      ...completeBehavioralFeedback(),
      improvements: null as unknown as string[],
    };
    expect(hasCompleteFeedback(feedback)).toBe(false);
  });

  it("rejects a feedback object missing clarity", () => {
    const { clarity, ...rest } = completeBehavioralFeedback();
    expect(hasCompleteFeedback(rest as Partial<FeedbackReport>)).toBe(false);
    void clarity;
  });

  it("rejects a feedback object missing follow_up_question", () => {
    const { follow_up_question, ...rest } = completeBehavioralFeedback();
    expect(hasCompleteFeedback(rest as Partial<FeedbackReport>)).toBe(false);
    void follow_up_question;
  });
});
