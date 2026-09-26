import { describe, expect, it } from "vitest";

import { hasCompleteFeedback } from "./feedback";
import type { LLMFeedback } from "./types";

function completeFeedback(): LLMFeedback {
  return {
    star: { situation: 7, task: 7, action: 8, result: 7 },
    clarity: 8,
    on_topic: true,
    rambling_notes: "",
    tips: ["a", "b", "c"],
    sample_answer: "A stronger answer would...",
    follow_up_question: "What would you do differently?",
  };
}

describe("hasCompleteFeedback", () => {
  it("accepts a fully-populated feedback object", () => {
    expect(hasCompleteFeedback(completeFeedback())).toBe(true);
  });

  it("rejects null", () => {
    expect(hasCompleteFeedback(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(hasCompleteFeedback(undefined)).toBe(false);
  });

  it("rejects a feedback object with a null star", () => {
    const feedback = { ...completeFeedback(), star: null as unknown as LLMFeedback["star"] };
    expect(hasCompleteFeedback(feedback)).toBe(false);
  });

  it("rejects a feedback object missing a star sub-field", () => {
    const feedback = completeFeedback();
    const partial = { ...feedback, star: { situation: 7, task: 7, action: 8 } };
    expect(hasCompleteFeedback(partial as Partial<LLMFeedback>)).toBe(false);
  });

  it("rejects a feedback object with a non-array tips field", () => {
    const feedback = { ...completeFeedback(), tips: null as unknown as string[] };
    expect(hasCompleteFeedback(feedback)).toBe(false);
  });

  it("rejects a feedback object missing clarity", () => {
    const { clarity, ...rest } = completeFeedback();
    expect(hasCompleteFeedback(rest as Partial<LLMFeedback>)).toBe(false);
    void clarity;
  });
});
