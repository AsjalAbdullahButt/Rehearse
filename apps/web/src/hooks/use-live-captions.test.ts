import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLiveCaptions } from "./use-live-captions";

interface FakeAlternative {
  transcript: string;
}
interface FakeResult {
  length: number;
  item(index: number): FakeAlternative;
}
interface FakeResultList {
  length: number;
  item(index: number): FakeResult;
}
interface FakeEvent {
  results: FakeResultList;
}

function buildResultList(pieces: string[]): FakeResultList {
  const results: FakeResult[] = pieces.map((text) => ({
    length: 1,
    item: () => ({ transcript: text }),
  }));
  return { length: results.length, item: (i: number) => results[i]! };
}

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: FakeEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  started = false;

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
    this.onend?.();
  }
}

describe("useLiveCaptions", () => {
  let instances: FakeSpeechRecognition[];

  beforeEach(() => {
    instances = [];
    class TrackedFakeSpeechRecognition extends FakeSpeechRecognition {
      constructor() {
        super();
        instances.push(this);
      }
    }
    vi.stubGlobal("SpeechRecognition", TrackedFakeSpeechRecognition);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
  });

  it("reports unsupported and never starts recognition when the API is absent", () => {
    vi.stubGlobal("SpeechRecognition", undefined);

    const { result } = renderHook(() => useLiveCaptions(true));

    expect(result.current.isSupported).toBe(false);
    expect(result.current.transcript).toBe("");
    expect(instances).toHaveLength(0);
  });

  it("starts recognition while active and reports the transcript from onresult", () => {
    const { result } = renderHook(() => useLiveCaptions(true));

    expect(instances).toHaveLength(1);
    expect(instances[0]?.started).toBe(true);

    act(() => {
      instances[0]?.onresult?.({ results: buildResultList(["hello there"]) });
    });

    expect(result.current.transcript).toBe("hello there");
    expect(result.current.isSupported).toBe(true);
  });

  it("does not start recognition when not active", () => {
    renderHook(() => useLiveCaptions(false));

    expect(instances).toHaveLength(0);
  });

  it("clears the transcript once active flips false", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useLiveCaptions(active),
      { initialProps: { active: true } },
    );

    act(() => {
      instances[0]?.onresult?.({ results: buildResultList(["partial answer"]) });
    });
    expect(result.current.transcript).toBe("partial answer");

    rerender({ active: false });

    expect(result.current.transcript).toBe("");
  });

  it("restarts recognition on onend while still active", () => {
    renderHook(() => useLiveCaptions(true));

    const recognition = instances[0]!;
    recognition.started = false;
    recognition.onend?.();

    expect(recognition.started).toBe(true);
  });
});
