import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioRecorder } from "./use-audio-recorder";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeStream(trackCount: number): MediaStream {
  const tracks = Array.from({ length: trackCount }, () => ({ stop: vi.fn() }));
  return { getTracks: () => tracks } as unknown as MediaStream;
}

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  ondataavailable: ((event: { data: { size: number } }) => void) | null = null;
  onstop: (() => void) | null = null;
  state: "inactive" | "recording" = "inactive";

  constructor(
    public stream: MediaStream,
    public options: unknown,
  ) {}

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }
}

class FakeAudioContext {
  state = "running";
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createAnalyser() {
    return { fftSize: 0 };
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe("useAudioRecorder", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
  });

  it("treats a second start() call while the first is still pending as a no-op", async () => {
    const stream = fakeStream(2);
    const deferred = createDeferred<MediaStream>();
    getUserMedia.mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useAudioRecorder(() => undefined));

    let firstCall: Promise<void> = Promise.resolve();
    let secondCall: Promise<void> = Promise.resolve();
    act(() => {
      firstCall = result.current.start();
      secondCall = result.current.start();
    });

    // Only one getUserMedia() request should ever have gone out, even though start() was
    // called twice back-to-back before the first had a chance to resolve.
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.isStarting).toBe(true);

    await act(async () => {
      deferred.resolve(stream);
      await firstCall;
      await secondCall;
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("recording");
    expect(result.current.isStarting).toBe(false);
    // The one legitimate MediaStream's tracks are still live — nothing stopped them.
    for (const track of stream.getTracks()) {
      expect(track.stop).not.toHaveBeenCalled();
    }
  });

  it("stops an in-flight stream if start() is superseded by stop() before it resolves", async () => {
    const stream = fakeStream(1);
    const deferred = createDeferred<MediaStream>();
    getUserMedia.mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useAudioRecorder(() => undefined));

    let startPromise: Promise<void> = Promise.resolve();
    act(() => {
      startPromise = result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.status).toBe("stopped");

    await act(async () => {
      deferred.resolve(stream);
      await startPromise;
    });

    // The stream only arrived after stop() had already superseded this start() attempt — it
    // must be released, and must not flip the status back to "recording".
    for (const track of stream.getTracks()) {
      expect(track.stop).toHaveBeenCalled();
    }
    expect(result.current.status).toBe("stopped");
  });
});
