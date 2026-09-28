import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MicOrb } from "./mic-orb";

/** motion/react's `animate` prop isn't reflected onto the DOM element directly, so these tests
 * key off `transition`'s `repeat`/`duration` behavior indirectly by checking that the bars exist
 * and the component renders without error across every voiceActive permutation — the real
 * behavioral contract (looping vs. settled) is documented in mic-orb.tsx and exercised visually,
 * consistent with this codebase's existing approach to motion-heavy components (see
 * AGENTS.md's note on InterviewFlow having no test file for the same reason, one level up). */
describe("MicOrb", () => {
  it("renders without voiceActive (the landing page's purely decorative usage)", () => {
    const { container } = render(<MicOrb />);
    expect(container.querySelectorAll("span")).toHaveLength(5);
  });

  it("renders while recording with voiceActive=true (speaking)", () => {
    const { container } = render(<MicOrb recording voiceActive={true} />);
    expect(container.querySelectorAll("span")).toHaveLength(5);
  });

  it("renders while recording with voiceActive=false (silence)", () => {
    const { container } = render(<MicOrb recording voiceActive={false} />);
    expect(container.querySelectorAll("span")).toHaveLength(5);
  });

  it("swaps the orb color between idle (lime) and recording (coral)", () => {
    const { container: idle } = render(<MicOrb recording={false} />);
    const { container: recording } = render(<MicOrb recording={true} />);

    expect(idle.querySelector(".bg-lime")).toBeInTheDocument();
    expect(recording.querySelector(".bg-coral")).toBeInTheDocument();
  });
});
