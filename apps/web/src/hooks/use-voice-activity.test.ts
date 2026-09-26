import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVoiceActivity } from "./use-voice-activity";

function fakeAnalyser(getVolume: () => number): AnalyserNode {
  return {
    frequencyBinCount: 4,
    getByteFrequencyData: (array: Uint8Array) => {
      array.fill(getVolume());
    },
  } as unknown as AnalyserNode;
}

describe("useVoiceActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports silence while the analyser stays quiet", () => {
    const analyser = fakeAnalyser(() => 2);
    const { result } = renderHook(() => useVoiceActivity(analyser, true));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.hasSpokenAtAll).toBe(false);
  });

  it("reports speaking once volume crosses the threshold", () => {
    const analyser = fakeAnalyser(() => 80);
    const { result } = renderHook(() => useVoiceActivity(analyser, true));

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.isSpeaking).toBe(true);
    expect(result.current.hasSpokenAtAll).toBe(true);
  });

  it("remembers hasSpokenAtAll after going quiet again", () => {
    let volume = 80;
    const analyser = fakeAnalyser(() => volume);
    const { result } = renderHook(() => useVoiceActivity(analyser, true));

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.isSpeaking).toBe(true);

    volume = 2;
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.hasSpokenAtAll).toBe(true);
  });

  it("resets both flags for a fresh recording when active flips off then on", () => {
    const analyser = fakeAnalyser(() => 80);
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useVoiceActivity(analyser, active),
      { initialProps: { active: true } },
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.hasSpokenAtAll).toBe(true);

    rerender({ active: false });
    rerender({ active: true });

    expect(result.current.hasSpokenAtAll).toBe(false);
    expect(result.current.isSpeaking).toBe(false);
  });

  it("does nothing when there is no analyser", () => {
    const { result } = renderHook(() => useVoiceActivity(null, true));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.hasSpokenAtAll).toBe(false);
  });
});
