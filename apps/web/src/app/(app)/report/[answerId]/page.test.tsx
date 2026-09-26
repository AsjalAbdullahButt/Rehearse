import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnswerReport } from "@/lib/interview/types";

// jsdom has no IntersectionObserver; framer-motion's whileInView (used by ScoreRing/StarBars)
// needs one to mount at all, even though this test never scrolls anything into view.
class FakeIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const { fetchAnswerReportMock } = vi.hoisted(() => ({ fetchAnswerReportMock: vi.fn() }));
vi.mock("@/lib/interview/server", () => ({
  fetchAnswerReport: fetchAnswerReportMock,
}));

import ReportPage from "./page";

function baseReport(): AnswerReport {
  return {
    id: "answer-1",
    session_id: "session-1",
    question_id: "question-1",
    question_text: "Tell me about a time you resolved a conflict.",
    transcript: "I once had a disagreement with a teammate...",
    transcript_parts: [{ type: "text", text: "I once had a disagreement.", seconds: null }],
    duration_s: 90,
    wpm: 120,
    filler_count: 2,
    filler_breakdown: {},
    long_pauses: 0,
    rambling: null,
    confidence_note: null,
    feedback: {
      star: { situation: 7, task: 7, action: 8, result: 7 },
      clarity: 8,
      on_topic: true,
      rambling_notes: "",
      tips: ["a", "b", "c"],
      sample_answer: "A stronger answer would...",
      follow_up_question: "What would you do differently?",
    },
    created_at: new Date().toISOString(),
  };
}

describe("ReportPage", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
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

  it("renders a 'feedback unavailable' state when feedback.star is null", async () => {
    const report = baseReport();
    fetchAnswerReportMock.mockResolvedValue({
      ...report,
      feedback: { ...report.feedback, star: null as unknown as AnswerReport["feedback"]["star"] },
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

  it("praises the strongest STAR area by name when it clears the highlight threshold", async () => {
    const report = baseReport();
    fetchAnswerReportMock.mockResolvedValue({
      ...report,
      feedback: { ...report.feedback, star: { situation: 5, task: 6, action: 9, result: 6 } },
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.getByText(/strongest part of this answer/)).toBeInTheDocument();
    expect(
      screen.getByText("you walked through the steps you actually took", { exact: false }),
    ).toBeInTheDocument();
  });

  it("omits the strength callout when no STAR area clears the highlight threshold", async () => {
    const report = baseReport();
    fetchAnswerReportMock.mockResolvedValue({
      ...report,
      feedback: { ...report.feedback, star: { situation: 4, task: 5, action: 6, result: 3 } },
    });

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    expect(screen.queryByText("Nice work —", { exact: false })).not.toBeInTheDocument();
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

  it("always offers a way to start another practice round", async () => {
    fetchAnswerReportMock.mockResolvedValue(baseReport());

    const element = await ReportPage({ params: Promise.resolve({ answerId: "answer-1" }) });
    render(element);

    const link = screen.getByRole("link", { name: "Let's try another round" });
    expect(link).toHaveAttribute("href", "/interview");
  });
});
