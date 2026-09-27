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
    started_at: "2026-01-01T00:00:00Z",
    answer_count: 3,
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

    fireEvent.click(screen.getByRole("button", { name: "Backend" }));

    expect(screen.getAllByText(/Answers/).length).toBe(1);
  });

  it("renders a category trend series for each category present in the data", () => {
    render(
      <ProgressView
        sessions={[row({ session_id: "s1", category_scores: { behavioral: 8, technical: 6 } })]}
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
});
