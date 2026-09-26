import { describe, expect, it } from "vitest";

import { clampFraction, cn, formatTime, getTimerTone, sanitizeNextPath } from "./utils";

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

describe("clampFraction", () => {
  it("computes a normal in-range fraction", () => {
    expect(clampFraction(5, 10)).toBe(0.5);
  });

  it("clamps a score above max to 1", () => {
    expect(clampFraction(13, 10)).toBe(1);
  });

  it("clamps a negative score to 0", () => {
    expect(clampFraction(-2, 10)).toBe(0);
  });

  it("clamps exactly at the boundaries", () => {
    expect(clampFraction(0, 10)).toBe(0);
    expect(clampFraction(10, 10)).toBe(1);
  });
});

describe("sanitizeNextPath", () => {
  it("accepts a legitimate in-app relative path", () => {
    expect(sanitizeNextPath("/progress", "/interview")).toBe("/progress");
  });

  it("falls back for an absolute external URL", () => {
    expect(sanitizeNextPath("https://evil.example", "/interview")).toBe("/interview");
  });

  it("falls back for a protocol-relative URL", () => {
    expect(sanitizeNextPath("//evil.example", "/interview")).toBe("/interview");
  });

  it("falls back for a value containing a scheme", () => {
    expect(sanitizeNextPath("/redirect?to=javascript:alert(1)", "/interview")).toBe("/interview");
  });

  it("falls back when next is missing", () => {
    expect(sanitizeNextPath(null, "/interview")).toBe("/interview");
  });
});
