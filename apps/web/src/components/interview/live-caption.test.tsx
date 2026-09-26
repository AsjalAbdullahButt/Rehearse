import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveCaption } from "./live-caption";

describe("LiveCaption", () => {
  it("renders nothing on an unsupported browser", () => {
    const { container } = render(<LiveCaption isSupported={false} transcript="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a listening placeholder before any speech is heard", () => {
    render(<LiveCaption isSupported={true} transcript="" />);
    expect(screen.getByText("Listening…")).toBeInTheDocument();
  });

  it("shows the live transcript once there is one", () => {
    render(<LiveCaption isSupported={true} transcript="I designed a rate limiter" />);
    expect(screen.getByText('"I designed a rate limiter"')).toBeInTheDocument();
  });
});
