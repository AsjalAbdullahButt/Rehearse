import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerPlayback } from "./answer-playback";

function fakeBlob(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
}

describe("AnswerPlayback", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock-answer-url");
    URL.revokeObjectURL = vi.fn();
    // jsdom doesn't implement real media playback — play()/pause() throw "Not implemented"
    // unless stubbed.
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("starts paused, showing a 'Play recording' control", () => {
    render(<AnswerPlayback blob={fakeBlob()} />);

    expect(screen.getByRole("button", { name: "Play recording" })).toBeInTheDocument();
  });

  it("calls audio.play() when the play button is clicked", () => {
    render(<AnswerPlayback blob={fakeBlob()} />);

    fireEvent.click(screen.getByRole("button", { name: "Play recording" }));

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it("flips to a 'Pause recording' control once playback actually starts", () => {
    render(<AnswerPlayback blob={fakeBlob()} />);
    const audio = document.querySelector("audio")!;

    fireEvent.click(screen.getByRole("button", { name: "Play recording" }));
    fireEvent.play(audio);

    const pauseButton = screen.getByRole("button", { name: "Pause recording" });
    fireEvent.click(pauseButton);

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
  });

  it("reverts to 'Play recording' once playback ends", () => {
    render(<AnswerPlayback blob={fakeBlob()} />);
    const audio = document.querySelector("audio")!;

    fireEvent.play(audio);
    expect(screen.getByRole("button", { name: "Pause recording" })).toBeInTheDocument();

    fireEvent.ended(audio);
    expect(screen.getByRole("button", { name: "Play recording" })).toBeInTheDocument();
  });

  it("exposes a real, accessible seek slider that updates the audio's currentTime", () => {
    render(<AnswerPlayback blob={fakeBlob()} />);
    const audio = document.querySelector("audio")! as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { value: 12, configurable: true });
    fireEvent.loadedMetadata(audio);

    const seekSlider = screen.getByRole("slider", { name: "Seek recording" });
    fireEvent.change(seekSlider, { target: { value: "5" } });

    expect(audio.currentTime).toBe(5);
  });

  it("shows the current time and total duration in mm:ss form", () => {
    render(<AnswerPlayback blob={fakeBlob()} />);
    const audio = document.querySelector("audio")! as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { value: 65, configurable: true });
    fireEvent.loadedMetadata(audio);

    expect(screen.getByText("0:00 / 1:05")).toBeInTheDocument();
  });

  it("releases the object URL on unmount", () => {
    const { unmount } = render(<AnswerPlayback blob={fakeBlob()} />);

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-answer-url");
  });
});
