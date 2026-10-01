import { describe, expect, it } from "vitest";

import { detectPitchHz, ProsodyAccumulator, rmsOf, toDb } from "./prosody";

const SAMPLE_RATE = 48_000;
const FRAME = 2048;

function sine(hz: number, amplitude = 0.3, length = FRAME): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
  }
  return out;
}

function noise(amplitude = 0.3, length = FRAME): Float32Array {
  // Deterministic pseudo-random so the test never flakes.
  let seed = 12345;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    out[i] = amplitude * (seed / 4294967296 - 0.5) * 2;
  }
  return out;
}

describe("detectPitchHz", () => {
  it.each([110, 180, 250])("finds a %d Hz tone", (hz) => {
    const found = detectPitchHz(sine(hz), SAMPLE_RATE);
    expect(found).not.toBeNull();
    expect(Math.abs(found! - hz) / hz).toBeLessThan(0.03);
  });

  it("returns null for silence and for unpitched noise", () => {
    expect(detectPitchHz(new Float32Array(FRAME), SAMPLE_RATE)).toBeNull();
    expect(detectPitchHz(noise(), SAMPLE_RATE)).toBeNull();
  });
});

describe("level helpers", () => {
  it("measures RMS and decibels", () => {
    expect(rmsOf(sine(200, 1))).toBeCloseTo(Math.SQRT1_2, 2);
    expect(toDb(1)).toBeCloseTo(0);
    expect(toDb(0.1)).toBeCloseTo(-20);
    expect(toDb(0)).toBeLessThan(-100);
  });
});

describe("ProsodyAccumulator", () => {
  it("has no summary until there is voiced audio", () => {
    const acc = new ProsodyAccumulator();
    for (let i = 0; i < 50; i++) acc.addFrame(new Float32Array(FRAME), SAMPLE_RATE);
    expect(acc.summary()).toBeNull();
  });

  it("sees a monotone, constant-volume voice as flat", () => {
    const acc = new ProsodyAccumulator();
    for (let i = 0; i < 80; i++) acc.addFrame(sine(150, 0.2), SAMPLE_RATE);
    const summary = acc.summary()!;

    expect(summary.voiced_frames).toBe(80);
    expect(summary.pitch_std_semitones).toBeLessThan(0.3);
    expect(summary.energy_cv).toBeLessThan(0.01);
    expect(summary.volume_std_db).toBeLessThan(0.1);
    expect(summary.pitch_median_hz).toBeGreaterThan(140);
    expect(summary.pitch_median_hz).toBeLessThan(160);
  });

  it("sees a varying voice as expressive", () => {
    const acc = new ProsodyAccumulator();
    for (let i = 0; i < 80; i++) {
      const hz = 130 + 90 * Math.abs(Math.sin(i / 6));
      const amplitude = 0.05 + 0.3 * Math.abs(Math.sin(i / 9));
      acc.addFrame(sine(hz, amplitude), SAMPLE_RATE);
    }
    const summary = acc.summary()!;

    expect(summary.pitch_std_semitones!).toBeGreaterThan(1.8);
    expect(summary.energy_cv).toBeGreaterThan(0.35);
  });

  it("ignores quiet background frames for voice statistics but counts them as frames", () => {
    const acc = new ProsodyAccumulator();
    for (let i = 0; i < 30; i++) acc.addFrame(sine(150, 0.2), SAMPLE_RATE);
    for (let i = 0; i < 70; i++) acc.addFrame(sine(150, 0.0005), SAMPLE_RATE);
    const summary = acc.summary()!;

    expect(summary.frames).toBe(100);
    expect(summary.voiced_frames).toBe(30);
  });

  it("reports pitch as unmeasured rather than guessing when too few frames are pitched", () => {
    const acc = new ProsodyAccumulator();
    for (let i = 0; i < 60; i++) acc.addFrame(noise(0.2), SAMPLE_RATE);
    const summary = acc.summary()!;

    expect(summary.pitch_std_semitones).toBeNull();
    expect(summary.pitch_median_hz).toBeNull();
    expect(summary.voiced_frames).toBe(60);
  });

  it("starts clean after a reset", () => {
    const acc = new ProsodyAccumulator();
    for (let i = 0; i < 20; i++) acc.addFrame(sine(150, 0.2), SAMPLE_RATE);
    acc.reset();
    expect(acc.summary()).toBeNull();
  });
});
