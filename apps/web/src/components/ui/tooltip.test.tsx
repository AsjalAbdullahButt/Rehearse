import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tooltip } from "./tooltip";

describe("Tooltip", () => {
  it("attaches aria-describedby to the focusable child, not a wrapping span", () => {
    render(
      <Tooltip content="Extra context">
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Trigger" });
    const describedBy = trigger.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.id).toBe(describedBy);
    // Not on some other wrapping element instead of the button itself.
    expect(trigger.parentElement?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("merges with an aria-describedby the child already had, rather than clobbering it", () => {
    render(
      <Tooltip content="Extra context">
        <button type="button" aria-describedby="external-hint">
          Trigger
        </button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Trigger" });
    const tooltip = screen.getByRole("tooltip");

    expect(trigger.getAttribute("aria-describedby")).toContain("external-hint");
    expect(trigger.getAttribute("aria-describedby")).toContain(tooltip.id);
  });
});
