import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAnswerDraft, countWords, TypedAnswer } from "./typed-answer";

describe("TypedAnswer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function type(value: string) {
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value } });
  }

  it("counts words and keeps Submit disabled until there is something to send", () => {
    render(<TypedAnswer questionId="q1" isSubmitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeDisabled();

    type("one two  three");
    expect(screen.getByText(/3 words/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeEnabled();
    expect(countWords("   ")).toBe(0);
  });

  it("submits with Ctrl+Enter or Cmd+Enter but never with Enter alone", () => {
    const onSubmit = vi.fn();
    render(<TypedAnswer questionId="q1" isSubmitting={false} onSubmit={onSubmit} />);
    type("my answer");
    const box = screen.getByLabelText("Your answer");

    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenCalledWith("my answer");
  });

  it("autosaves a draft on this device and restores it for the same question", () => {
    const { unmount } = render(
      <TypedAnswer questionId="q1" isSubmitting={false} onSubmit={vi.fn()} />,
    );
    type("half-finished thought");
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByText(/Draft saved on this device/)).toBeInTheDocument();
    unmount();

    render(<TypedAnswer questionId="q1" isSubmitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Your answer")).toHaveValue("half-finished thought");

    clearAnswerDraft("q1");
    expect(localStorage.getItem("rehearse:answer-draft:q1")).toBeNull();
  });

  it("does not submit again while a submission is in flight", () => {
    const onSubmit = vi.fn();
    render(<TypedAnswer questionId="q2" isSubmitting onSubmit={onSubmit} />);
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
  });
});
