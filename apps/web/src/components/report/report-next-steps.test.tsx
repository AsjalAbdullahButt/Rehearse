import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { ReportNextSteps } from "./report-next-steps";

/** Simulates the section being visible immediately — real browsers would fire this once the
 * user actually scrolls the section into view; tests don't scroll, so this stands in for "the
 * user has reached the end of the report". */
class ImmediatelyIntersectingObserver {
  #callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.#callback = callback;
  }
  observe(target: Element): void {
    this.#callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve(): void {}
  disconnect(): void {}
}

function renderSteps(overrides: Partial<Parameters<typeof ReportNextSteps>[0]> = {}) {
  return render(
    <ReportNextSteps
      sessionId="session-1"
      questionNumber={1}
      questionCount={3}
      sessionStatus="in_progress"
      nextQuestion={{
        id: "question-2",
        sequence_number: 2,
        text: "Next question",
        category: "behavioral",
        source: "bank",
      }}
      {...overrides}
    />,
  );
}

describe("ReportNextSteps", () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
    localStorage.clear();
    vi.stubGlobal("IntersectionObserver", ImmediatelyIntersectingObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows only the summary link once the session is over", () => {
    renderSteps({ sessionStatus: "completed", nextQuestion: null });

    expect(screen.getByRole("button", { name: "View session summary" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End interview here" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "Automatically continue to the next question" }),
    ).not.toBeInTheDocument();
  });

  it("opens the in-progress summary without pretending to complete the session", () => {
    renderSteps();
    fireEvent.click(screen.getByRole("button", { name: "View progress so far" }));
    expect(pushMock).toHaveBeenCalledWith("/session/session-1/summary");
  });

  it("does not auto-advance while the preference is off", () => {
    vi.useFakeTimers();
    renderSteps();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("auto-advances to the next question once enabled and the section is in view", async () => {
    vi.useFakeTimers();
    renderSteps();

    fireEvent.click(
      screen.getByRole("switch", { name: "Automatically continue to the next question" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Continuing to question 2 in 8s");

    // The countdown re-schedules a fresh setTimeout from within each previous one's callback —
    // the async variant properly awaits React's state-update flush between each link in that
    // chain, unlike the sync advanceTimersByTime, which can race ahead of React's own scheduler.
    // 8100, not 8000: the 8th and final tick's setState->effect->router.push chain still needs
    // its own microtask flush after the fake clock reaches exactly 8000ms, and advancing to
    // precisely the last timer's own deadline doesn't reliably leave room for that — a small
    // margin past it does, deterministically (confirmed by re-running this repeatedly).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8100);
    });

    expect(pushMock).toHaveBeenCalledWith("/interview?session=session-1");
  });

  it("cancels the auto-advance countdown when 'Stay on this report' is clicked", () => {
    vi.useFakeTimers();
    renderSteps();

    fireEvent.click(
      screen.getByRole("switch", { name: "Automatically continue to the next question" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Stay on this report" }));

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("remembers the auto-advance preference across remounts of the same session", () => {
    vi.useFakeTimers();
    const { unmount } = renderSteps();
    fireEvent.click(
      screen.getByRole("switch", { name: "Automatically continue to the next question" }),
    );
    unmount();

    renderSteps();

    expect(
      screen.getByRole("switch", { name: "Automatically continue to the next question" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("does not carry the auto-advance preference over to a different session", () => {
    localStorage.setItem("rehearse:auto-advance:session-1", "true");

    renderSteps({ sessionId: "session-2" });

    expect(
      screen.getByRole("switch", { name: "Automatically continue to the next question" }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
