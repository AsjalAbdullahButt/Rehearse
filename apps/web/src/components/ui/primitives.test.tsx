import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeviceCheck } from "@/components/interview/device-check";
import { InterviewProgress } from "@/components/interview/interview-progress";
import { RecordingStatus } from "@/components/interview/recording-status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ScoreBadge } from "@/components/ui/score-badge";
import { scoreBand, scoreBandFromTen } from "@/lib/score-band";

describe("scoreBand", () => {
  it("maps the documented thresholds", () => {
    expect(scoreBand(95).label).toBe("Excellent");
    expect(scoreBand(90).label).toBe("Excellent");
    expect(scoreBand(89).label).toBe("Strong");
    expect(scoreBand(75).label).toBe("Strong");
    expect(scoreBand(74).label).toBe("Developing");
    expect(scoreBand(60).label).toBe("Developing");
    expect(scoreBand(59).label).toBe("Needs practice");
    expect(scoreBandFromTen(7.5).label).toBe("Strong");
  });

  it("always renders the band as text, not just colour", () => {
    render(<ScoreBadge band={scoreBand(40)} />);
    expect(screen.getByText("Needs practice")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("is disabled and marked busy while loading, so it cannot be fired twice", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Preparing…
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Preparing…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("ProgressBar", () => {
  it("exposes its value to assistive tech and clamps out-of-range input", () => {
    render(<ProgressBar value={150} max={100} label="Mastery" />);
    expect(screen.getByRole("progressbar", { name: "Mastery" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
});

describe("ErrorState / EmptyState", () => {
  it("shows a recovery action and an unobtrusive reference id", () => {
    render(
      <ErrorState
        title="We couldn’t generate the next question"
        description="Your progress is safe."
        requestId="req-123"
        actions={<Button>Try again</Button>}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Your progress is safe.");
    expect(screen.getByText("Reference: req-123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains an empty list and offers the next step", () => {
    render(
      <EmptyState title="Nothing yet" description="Do a thing." action={<a href="/x">Go</a>} />,
    );
    expect(screen.getByRole("link", { name: "Go" })).toBeInTheDocument();
  });
});

describe("InterviewProgress", () => {
  it("shows position, an upper-bound time hint and a progress bar of completed questions", () => {
    render(<InterviewProgress current={4} total={10} answerCapS={120} category="technical" />);
    expect(screen.getByText(/Question 4 of 10/)).toBeInTheDocument();
    // 7 questions left (4..10) x 2 min cap = 14 min upper bound.
    expect(screen.getByText("Up to 14 min of answers left")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Interview progress" })).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
    expect(screen.getByText("Technical")).toBeInTheDocument();
  });

  it("says so on the last question", () => {
    render(<InterviewProgress current={5} total={5} answerCapS={120} />);
    expect(screen.getByText("Last question")).toBeInTheDocument();
  });
});

describe("RecordingStatus", () => {
  it("names the state in words and shows the clock only while recording", () => {
    const { rerender } = render(<RecordingStatus phase="recording" clock="1:32" />);
    expect(screen.getByRole("status")).toHaveTextContent("Recording");
    expect(screen.getByText("1:32 left")).toBeInTheDocument();

    rerender(<RecordingStatus phase="processing" clock="1:32" />);
    expect(screen.getByRole("status")).toHaveTextContent("Transcribing and evaluating");
    expect(screen.queryByText("1:32 left")).not.toBeInTheDocument();
  });
});

describe("DeviceCheck", () => {
  const base = {
    browserSupported: true,
    online: true,
    micLive: false,
    micHeard: false,
    micStarting: false,
    micError: null,
    analyser: null,
    onTestMic: vi.fn(),
    onContinue: vi.fn(),
    onUseText: vi.fn(),
  };

  it("reports each check and confirms when everything works", () => {
    render(<DeviceCheck {...base} micHeard />);
    expect(screen.getByText("Supported")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("Everything looks good.")).toBeInTheDocument();
  });

  it("explains an unsupported browser and blocks continuing", () => {
    render(<DeviceCheck {...base} browserSupported={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/can’t record audio/);
    expect(screen.getByRole("button", { name: "Skip check" })).toBeDisabled();
  });

  it("shows a plain-language mic error with a retry", () => {
    const onTestMic = vi.fn();
    render(<DeviceCheck {...base} micError="No microphone was found." onTestMic={onTestMic} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No microphone was found.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onTestMic).toHaveBeenCalled();
  });

  it("holds the user at the check while offline", () => {
    render(<DeviceCheck {...base} online={false} />);
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip check" })).toBeDisabled();
  });

  it("offers typing as a way past a missing or unwanted microphone", () => {
    const onUseText = vi.fn();
    render(<DeviceCheck {...base} browserSupported={false} onUseText={onUseText} />);
    fireEvent.click(screen.getByRole("button", { name: "Type your answers instead" }));
    expect(onUseText).toHaveBeenCalled();
  });
});
