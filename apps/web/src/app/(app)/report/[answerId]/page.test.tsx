import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnswerReport } from "@/lib/interview/types";

// jsdom has no IntersectionObserver; framer-motion's whileInView (used by ScoreRing/RubricBars)
// and ReportNextSteps' own scroll-into-view auto-advance trigger both need one to mount at all,
// even though this test never actually scrolls anything into view.
class FakeIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const { fetchAnswerReportMock, fetchAttemptsMock } = vi.hoisted(() => ({
  fetchAnswerReportMock: vi.fn(),
  fetchAttemptsMock: vi.fn(),
}));
vi.mock("@/lib/interview/server", () => ({
  fetchAnswerReport: fetchAnswerReportMock,
  fetchAttempts: fetchAttemptsMock,
}));

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import ReportPage from "./page";

function baseReport(): AnswerReport {
  return {
    id: "answer-1",
    session_id: "session-1",
    question_id: "question-1",
    session_question_id: "session-question-1",
    category: "behavioral",
    question_text: "Tell me about a time you resolved a conflict.",
    transcript: "I once had a disagreement with a teammate...",
    transcript_parts: [{ type: "text", text: "I once had a disagreement.", seconds: null }],
    duration_s: 90,
    wpm: 120,
    word_count: 180,
    filler_count: 2,
    filler_breakdown: {},
    possible_filler_count: 0,
    possible_filler_breakdown: {},
    filler_rate_per_100_words: 1.1,
    long_pauses: 0,
    max_pause_s: 1.2,
    total_long_pause_s: 0,
    avg_pause_s: 0.4,
    rambling: null,
    confidence_note: null,
    transcription_quality_warning: null,
    feedback: {
      rubric: { category: "behavioral", situation: 7, task: 7, action: 8, result: 7 },
      clarity: 8,
      on_topic: true,
      strengths: ["Clear structure."],
      improvements: ["Quantify the impact."],
      evidence: [],
      rambling_notes: "",
      rewritten_answer: "A cleaned-up version of the candidate's own answer.",
      reference_answer: null,
      missing_information: [],
      follow_up_question: "What would you do differently?",
    },
    created_at: new Date().toISOString(),
    question_number: 1,
    question_count: 3,
    session_status: "in_progress",
    next_question: {
      id: "session-question-2",
      sequence_number: 2,
      text: "Next question",
      category: "behavioral",
      source: "bank",
    },
    attempt_number: 1,
    original_answer_id: null,
  };
}

describe("ReportPage", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    pushMock.mockClear();
    refreshMock.mockClear();
    fetchAttemptsMock.mockReset();
    fetchAttemptsMock.mockResolvedValue(null);
  });

  it("renders a 'feedback unavailable' state instead of throwing when feedback is null", async () => {
    fetchAnswerReportMock.mockResolvedValue({
      ...baseReport(),
      feedback: null as unknown as AnswerReport["feedback"],
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.getByText("Feedback unavailable")).toBeInTheDocument();
  });

  it("renders a 'feedback unavailable' state when feedback.rubric is null", async () => {
    const report = baseReport();
    fetchAnswerReportMock.mockResolvedValue({
      ...report,
      feedback: {
        ...report.feedback,
        rubric: null as unknown as AnswerReport["feedback"]["rubric"],
      },
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.getByText("Feedback unavailable")).toBeInTheDocument();
  });

  it("renders the real report when feedback is complete", async () => {
    fetchAnswerReportMock.mockResolvedValue(baseReport());

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.queryByText("Feedback unavailable")).not.toBeInTheDocument();
    expect(screen.getByText("Tell me about a time you resolved a conflict.")).toBeInTheDocument();
  });

  it("praises the strongest rubric area by name when it clears the highlight threshold", async () => {
    const report = baseReport();
    fetchAnswerReportMock.mockResolvedValue({
      ...report,
      feedback: {
        ...report.feedback,
        rubric: { category: "behavioral" as const, situation: 5, task: 6, action: 9, result: 6 },
      },
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.getByText(/strongest part of this answer/)).toBeInTheDocument();
    expect(
      screen.getByText("you walked through the steps you actually took", { exact: false }),
    ).toBeInTheDocument();
  });

  it("omits the strength callout when no rubric area clears the highlight threshold", async () => {
    const report = baseReport();
    fetchAnswerReportMock.mockResolvedValue({
      ...report,
      feedback: {
        ...report.feedback,
        rubric: { category: "behavioral" as const, situation: 4, task: 5, action: 6, result: 3 },
      },
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.queryByText("Nice work —", { exact: false })).not.toBeInTheDocument();
  });

  it("renders a technical rubric with technical labels, never STAR labels", async () => {
    const report = baseReport();
    fetchAnswerReportMock.mockResolvedValue({
      ...report,
      category: "technical",
      feedback: {
        ...report.feedback,
        rubric: {
          category: "technical" as const,
          correctness: 8,
          depth: 7,
          tradeoffs: 6,
          communication: 8,
        },
        rewritten_answer: null,
        reference_answer: "A fresh example answer.",
      },
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.getByText("Technical assessment")).toBeInTheDocument();
    // "Correctness" legitimately appears twice (the rubric bar label and the strongest-area
    // callout naming it by name) — getAllByText just confirms it rendered at all.
    expect(screen.getAllByText("Correctness").length).toBeGreaterThan(0);
    expect(screen.queryByText("Situation")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reference answer" })).toBeInTheDocument();
  });

  it("shows the confidence coaching note when the API returns one", async () => {
    fetchAnswerReportMock.mockResolvedValue({
      ...baseReport(),
      confidence_note: 'You leaned on filler words like "um" and "uh" quite a bit here.',
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.getByText(/leaned on filler words/)).toBeInTheDocument();
  });

  it("shows the transcription quality warning when the API returns one", async () => {
    fetchAnswerReportMock.mockResolvedValue({
      ...baseReport(),
      transcription_quality_warning: "This transcription may be unreliable.",
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.getByText("This transcription may be unreliable.")).toBeInTheDocument();
  });

  it("renders evidence quotes when present", async () => {
    const report = baseReport();
    fetchAnswerReportMock.mockResolvedValue({
      ...report,
      feedback: { ...report.feedback, evidence: ["I led the migration."] },
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.getByText("“I led the migration.”")).toBeInTheDocument();
  });

  it("offers to continue the interview when more questions remain", async () => {
    fetchAnswerReportMock.mockResolvedValue(baseReport());

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    const button = screen.getByRole("button", { name: "Continue interview — Question 2 of 3" });
    fireEvent.click(button);
    expect(pushMock).toHaveBeenCalledWith("/interview?session=session-1");
  });

  it("offers the session summary once the session is complete", async () => {
    fetchAnswerReportMock.mockResolvedValue({
      ...baseReport(),
      question_number: 3,
      session_status: "completed",
      next_question: null,
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    const button = screen.getByRole("button", { name: "View session summary" });
    fireEvent.click(button);
    expect(pushMock).toHaveBeenCalledWith("/session/session-1/summary");
  });

  it("offers to view progress without claiming the interview has ended", async () => {
    fetchAnswerReportMock.mockResolvedValue(baseReport());

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    fireEvent.click(screen.getByRole("button", { name: "View progress so far" }));
    expect(pushMock).toHaveBeenCalledWith("/session/session-1/summary");
  });

  it("does not offer to end early once the session is already complete", async () => {
    fetchAnswerReportMock.mockResolvedValue({
      ...baseReport(),
      question_number: 3,
      session_status: "completed",
      next_question: null,
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.queryByRole("button", { name: "View progress so far" })).not.toBeInTheDocument();
  });

  it("persists the auto-advance preference per session in localStorage", async () => {
    fetchAnswerReportMock.mockResolvedValue(baseReport());

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    const toggle = screen.getByRole("switch", {
      name: "Automatically continue to the next question",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem("rehearse:auto-advance:session-1")).toBe("true");
  });

  it("offers a retry and no comparison for a first attempt", async () => {
    fetchAnswerReportMock.mockResolvedValue(baseReport());

    render(await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) }));

    expect(screen.getByRole("button", { name: "Record a new answer" })).toBeInTheDocument();
    expect(screen.queryByText("How your retry compares")).not.toBeInTheDocument();
  });

  it("shows the attempt comparison on a retry, with a way back to the summary", async () => {
    fetchAnswerReportMock.mockResolvedValue({
      ...baseReport(),
      attempt_number: 2,
      original_answer_id: "answer-0",
      next_question: null,
    });
    const attempt = (n: number, transcript: string) => ({
      answer_id: `a${n}`,
      attempt_number: n,
      transcript,
      created_at: "2026-01-01T00:00:00Z",
      overall_score: 5,
      clarity: 5,
      wpm: 120,
      filler_rate_per_100_words: 3,
      rubric: { situation: 5 },
    });
    fetchAttemptsMock.mockResolvedValue({
      attempts: [attempt(1, "first words"), attempt(2, "second words")],
      overall_delta: 2,
      components: [{ key: "situation", before: 5, after: 7, delta: 2 }],
      improved: ["situation"],
      regressed: [],
      remained_weak: [],
      focus_next: "situation",
      filler_rate_delta: -1,
      wpm_delta: 0,
      summary: ["Improved: situation."],
    });

    render(await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) }));

    expect(screen.getByText("How your retry compares")).toBeInTheDocument();
    expect(screen.getByText("Improved: situation.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your interview summary" })).toHaveAttribute(
      "href",
      "/session/session-1/summary",
    );
  });

  it("stops offering retries once the attempt limit is reached", async () => {
    fetchAnswerReportMock.mockResolvedValue(baseReport());
    fetchAttemptsMock.mockResolvedValue({
      attempts: Array.from({ length: 5 }, (_, i) => ({
        answer_id: `a${i}`,
        attempt_number: i + 1,
        transcript: "t",
        created_at: "2026-01-01T00:00:00Z",
        overall_score: 5,
        clarity: 5,
        wpm: 1,
        filler_rate_per_100_words: 0,
        rubric: {},
      })),
      overall_delta: 0,
      components: [],
      improved: [],
      regressed: [],
      remained_weak: [],
      focus_next: null,
      filler_rate_delta: 0,
      wpm_delta: 0,
      summary: [],
    });

    render(await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) }));

    expect(screen.queryByRole("button", { name: "Record a new answer" })).not.toBeInTheDocument();
    expect(screen.getByText(/used all 5 attempts/)).toBeInTheDocument();
  });
});
