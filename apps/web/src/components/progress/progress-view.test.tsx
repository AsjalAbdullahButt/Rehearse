import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProgressRow } from "@/lib/interview/types";

vi.mock("@/hooks/use-session-expiry", () => ({
  useSessionExpiry: () => vi.fn().mockResolvedValue(false),
}));

import { ProgressView } from "./progress-view";

function row(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    session_id: "session-1",
    role: "backend",
    difficulty: "medium",
    interview_mode: "technical_qa",
    started_at: "2026-01-01T00:00:00Z",
    answer_count: 3,
    status: "completed",
    question_count: 5,
    answer_cap_s: 120,
    focus: "mixed",
    company: null,
    role_title: null,
    total_answer_s: 300,
    avg_wpm: 120,
    avg_filler_count: 2,
    avg_clarity: 7,
    avg_overall_score: 7,
    avg_filler_rate_per_100_words: 1.5,
    category_scores: { behavioral: 7 },
    ...overrides,
  };
}

describe("ProgressView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders a session card for each session", () => {
    render(
      <ProgressView
        sessions={[row({ session_id: "s1" }), row({ session_id: "s2", role: "frontend" })]}
      />,
    );

    expect(screen.getAllByText(/Answers/).length).toBe(2);
  });

  it("shows each session's interview mode", () => {
    render(<ProgressView sessions={[row({ interview_mode: "system_design" })]} />);

    expect(screen.getByText("System design")).toBeInTheDocument();
  });

  it("does not show a role filter when only one role is present", () => {
    render(<ProgressView sessions={[row(), row({ session_id: "s2" })]} />);

    expect(screen.queryByText("Role")).not.toBeInTheDocument();
  });

  it("filters session cards by role when multiple roles are present", () => {
    render(
      <ProgressView
        sessions={[
          row({ session_id: "s1", role: "backend" }),
          row({ session_id: "s2", role: "frontend" }),
        ]}
      />,
    );

    expect(screen.getAllByText(/Answers/).length).toBe(2);

    fireEvent.click(screen.getByRole("radio", { name: "Backend" }));

    expect(screen.getAllByText(/Answers/).length).toBe(1);
  });

  it("renders a category trend series for each category present in the data", () => {
    render(
      <ProgressView
        sessions={[
          row({ session_id: "s1", category_scores: { behavioral: 8, technical: 6 } }),
          row({ session_id: "s2", category_scores: { behavioral: 7, technical: 7 } }),
        ]}
      />,
    );

    expect(screen.getAllByText("Behavioral").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Technical").length).toBeGreaterThan(0);
    expect(screen.queryByText("Situational")).not.toBeInTheDocument();
  });

  it("requires a confirmation step before deleting a session", () => {
    render(<ProgressView sessions={[row()]} />);

    expect(screen.queryByText(/Delete this session's data/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText(/Delete this session's data/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels the delete confirmation without calling the API", () => {
    render(<ProgressView sessions={[row()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/Delete this session's data/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("removes the session card once the delete succeeds", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    render(<ProgressView sessions={[row({ session_id: "s1" })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(screen.getByText("No sessions match this filter.")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/interview/sessions/s1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("keeps the session and confirmation available when deletion fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    render(<ProgressView sessions={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server"),
    );
    expect(screen.getByRole("button", { name: "Confirm delete" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "View summary" })).toHaveAttribute(
      "href",
      "/session/session-1/summary",
    );
  });

  it("shows an empty-state explanation instead of charts until there are two scored interviews", () => {
    render(<ProgressView sessions={[row()]} />);

    expect(
      screen.getByText(/Trends appear after your second scored interview/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Overall score trend")).not.toBeInTheDocument();
  });

  it("summarises the change from the previous interview once trends exist", () => {
    render(
      <ProgressView
        sessions={[
          row({ session_id: "new", started_at: "2026-02-01T00:00:00Z", avg_overall_score: 8.2 }),
          row({ session_id: "old", started_at: "2026-01-01T00:00:00Z", avg_overall_score: 6.9 }),
        ]}
      />,
    );

    expect(screen.getByText(/up 13 points/)).toBeInTheDocument();
  });

  it("shows percent scores with a quality label, technical and communication, and a retry link", () => {
    render(
      <ProgressView
        sessions={[
          row({
            avg_overall_score: 8.2,
            avg_clarity: 8.8,
            company: "Acme",
            category_scores: { technical: 7.8 },
          }),
        ]}
      />,
    );

    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText(/5 min speaking/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retry interview" })).toHaveAttribute(
      "href",
      "/interview?role=backend&difficulty=medium&focus=mixed&count=5&cap=120",
    );
  });

  it("filters by interview type and by status", () => {
    render(
      <ProgressView
        sessions={[
          row({ session_id: "a", interview_mode: "coding", status: "completed" }),
          row({ session_id: "b", interview_mode: "system_design", status: "in_progress" }),
        ]}
      />,
    );

    expect(screen.getAllByText(/Answers/).length).toBe(2);
    fireEvent.click(screen.getByRole("radio", { name: "Coding" }));
    expect(screen.getAllByText(/Answers/).length).toBe(1);
    fireEvent.click(screen.getByRole("radio", { name: "All types" }));
    fireEvent.click(screen.getByRole("radio", { name: "In progress" }));
    expect(screen.getAllByText(/Answers/).length).toBe(1);
    expect(screen.getByRole("link", { name: "View summary" })).toHaveAttribute(
      "href",
      "/session/b/summary",
    );
  });
});
