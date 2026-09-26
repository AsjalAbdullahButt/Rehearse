import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSilenceNudge } from "./use-silence-nudge";

describe("useSilenceNudge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onSilence once continuous silence crosses the threshold", () => {
    const onSilence = vi.fn();
    renderHook(() => useSilenceNudge(false, true, onSilence));

    act(() => {
      vi.advanceTimersByTime(6999);
    });
    expect(onSilence).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(onSilence).toHaveBeenCalledTimes(1);
  });

  it("never fires while speaking", () => {
    const onSilence = vi.fn();
    renderHook(() => useSilenceNudge(true, true, onSilence));

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(onSilence).not.toHaveBeenCalled();
  });

  it("never fires when not active", () => {
    const onSilence = vi.fn();
    renderHook(() => useSilenceNudge(false, false, onSilence));

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(onSilence).not.toHaveBeenCalled();
  });

  it("cancels a pending nudge the instant speaking starts", () => {
    const onSilence = vi.fn();
    const { rerender } = renderHook(
      ({ isSpeaking }: { isSpeaking: boolean }) => useSilenceNudge(isSpeaking, true, onSilence),
      { initialProps: { isSpeaking: false } },
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    rerender({ isSpeaking: true });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onSilence).not.toHaveBeenCalled();
  });

  it("fires again after the cooldown if still silent", () => {
    const onSilence = vi.fn();
    renderHook(() => useSilenceNudge(false, true, onSilence));

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(onSilence).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(onSilence).toHaveBeenCalledTimes(2);
  });

  it("reset() restarts the countdown, giving a fresh window", () => {
    const onSilence = vi.fn();
    const { result } = renderHook(() => useSilenceNudge(false, true, onSilence));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      result.current.reset();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onSilence).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onSilence).toHaveBeenCalledTimes(1);
  });
});
