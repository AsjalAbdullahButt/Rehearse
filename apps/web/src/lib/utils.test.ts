import { describe, expect, it } from "vitest";

import { cn, formatTime, getTimerTone } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("resolves conflicting tailwind classes, last wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("px-2", false, undefined, null, "py-1")).toBe("px-2 py-1");
  });
});

describe("formatTime", () => {
  it("formats whole minutes", () => {
    expect(formatTime(120)).toBe("2:00");
  });

  it("pads single-digit seconds", () => {
    expect(formatTime(65)).toBe("1:05");
  });

  it("formats under a minute", () => {
    expect(formatTime(9)).toBe("0:09");
  });

  it("truncates fractional seconds", () => {
    expect(formatTime(90.9)).toBe("1:30");
  });
});

describe("getTimerTone", () => {
  it("is neutral above 30s remaining", () => {
    expect(getTimerTone(31)).toBe("text-text");
  });

  it("is amber at exactly 30s remaining", () => {
    expect(getTimerTone(30)).toBe("text-amber");
  });

  it("is amber between the two thresholds", () => {
    expect(getTimerTone(11)).toBe("text-amber");
  });

  it("is coral at exactly 10s remaining", () => {
    expect(getTimerTone(10)).toBe("text-coral");
  });

  it("is coral at 0s remaining", () => {
    expect(getTimerTone(0)).toBe("text-coral");
  });
});
