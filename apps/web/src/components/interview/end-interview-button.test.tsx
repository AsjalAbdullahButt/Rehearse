import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { refreshMock, expiredMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  expiredMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));
vi.mock("@/hooks/use-session-expiry", () => ({
  useSessionExpiry: () => expiredMock,
}));

import { EndInterviewButton } from "./end-interview-button";

function respond(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(status === 204 ? null : "{}", { status })),
  );
}

describe("EndInterviewButton", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    expiredMock.mockReset();
    expiredMock.mockResolvedValue(false);
  });

  it("asks for confirmation first and explains what is kept", () => {
    respond(200);
    render(<EndInterviewButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "End this interview" }));

    expect(screen.getByRole("group", { name: "Confirm ending the interview" })).toBeInTheDocument();
    expect(screen.getByText(/answers and feedback so far are kept/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("can be backed out of without ending anything", () => {
    respond(200);
    render(<EndInterviewButton sessionId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "End this interview" }));

    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(screen.getByRole("button", { name: "End this interview" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ends the interview through the BFF and refreshes the page", async () => {
    respond(200);
    render(<EndInterviewButton sessionId="s 1" />);
    fireEvent.click(screen.getByRole("button", { name: "End this interview" }));

    fireEvent.click(screen.getByRole("button", { name: "Yes, end it" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith("/api/interview/sessions/s%201/end", { method: "POST" });
  });

  it("treats 'already finished' as success and shows the real state", async () => {
    respond(409);
    render(<EndInterviewButton sessionId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "End this interview" }));

    fireEvent.click(screen.getByRole("button", { name: "Yes, end it" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("reports a failure and does not refresh", async () => {
    respond(500);
    render(<EndInterviewButton sessionId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "End this interview" }));

    fireEvent.click(screen.getByRole("button", { name: "Yes, end it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not end the interview/);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("says so when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<EndInterviewButton sessionId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "End this interview" }));

    fireEvent.click(screen.getByRole("button", { name: "Yes, end it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/has not been ended/);
  });
});
