import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CameraCoachPanel } from "./camera-coach-panel";

function renderPanel(props: Partial<Parameters<typeof CameraCoachPanel>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <CameraCoachPanel
      enabled={false}
      status="off"
      onToggle={onToggle}
      attachVideo={vi.fn()}
      {...props}
    />,
  );
  return onToggle;
}

describe("CameraCoachPanel", () => {
  it("is off by default and explains what happens to the video before anything is switched on", () => {
    renderPanel();

    const toggle = screen.getByRole("checkbox", { name: /Visual coaching/ });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/not saved or uploaded/)).toBeInTheDocument();
    expect(screen.getByText(/never changes your scores/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your camera preview")).not.toBeInTheDocument();
  });

  it("only turns on when the user ticks it", () => {
    const onToggle = renderPanel();
    fireEvent.click(screen.getByRole("checkbox", { name: /Visual coaching/ }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("shows a local preview and status once enabled", () => {
    renderPanel({ enabled: true, status: "starting" });
    expect(screen.getByLabelText("Your camera preview")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/loading the on-device model/);
  });

  it("says plainly when it could not start, and that the interview can continue", () => {
    renderPanel({ enabled: true, status: "error" });
    expect(screen.getByRole("status")).toHaveTextContent(/continue without it/);
  });

  it("cannot be toggled mid-recording", () => {
    renderPanel({ disabled: true });
    expect(screen.getByRole("checkbox", { name: /Visual coaching/ })).toBeDisabled();
  });
});
