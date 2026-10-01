import { describe, expect, it } from "vitest";

import { CameraAccumulator, headPoseFromLandmarks, isLookingAway, type Landmark } from "./pose";

/** A face centred in frame; shifting the nose within the cheek span turns the head. */
function face(noseX = 0.5, noseY = 0.5): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[1] = { x: noseX, y: noseY }; // nose tip
  landmarks[10] = { x: 0.5, y: 0.2 }; // forehead
  landmarks[152] = { x: 0.5, y: 0.8 }; // chin
  landmarks[234] = { x: 0.3, y: 0.5 }; // left cheek
  landmarks[454] = { x: 0.7, y: 0.5 }; // right cheek
  return landmarks;
}

describe("headPoseFromLandmarks", () => {
  it("reads a face looking straight ahead as roughly zero", () => {
    const pose = headPoseFromLandmarks(face())!;
    expect(Math.abs(pose.yawDeg)).toBeLessThan(1);
    expect(Math.abs(pose.pitchDeg)).toBeLessThan(1);
    expect(isLookingAway(pose)).toBe(false);
  });

  it("turns the sign with the direction of the turn and counts a big turn as looking away", () => {
    const right = headPoseFromLandmarks(face(0.62))!;
    const left = headPoseFromLandmarks(face(0.38))!;
    expect(right.yawDeg).toBeGreaterThan(25);
    expect(left.yawDeg).toBeLessThan(-25);
    expect(isLookingAway(right)).toBe(true);
  });

  it("detects looking down", () => {
    const pose = headPoseFromLandmarks(face(0.5, 0.62))!;
    expect(pose.pitchDeg).toBeGreaterThan(20);
    expect(isLookingAway(pose)).toBe(true);
  });

  it("returns null for degenerate or incomplete landmarks", () => {
    expect(headPoseFromLandmarks([])).toBeNull();
    const flat = face();
    flat[454] = { x: 0.3, y: 0.5 };
    expect(headPoseFromLandmarks(flat)).toBeNull();
  });
});

describe("CameraAccumulator", () => {
  function run(frames: (Landmark[] | null)[], stepMs = 100): CameraAccumulator {
    const acc = new CameraAccumulator();
    frames.forEach((landmarks, i) => acc.addFrame(i * stepMs, landmarks));
    return acc;
  }

  it("has no summary before any frame", () => {
    expect(new CameraAccumulator().summary()).toBeNull();
  });

  it("describes a still, centred speaker", () => {
    const summary = run(Array.from({ length: 50 }, () => face())).summary()!;

    expect(summary.face_present_ratio).toBe(1);
    expect(summary.looking_away_ratio).toBe(0);
    expect(summary.away_events).toBe(0);
    expect(summary.head_motion_deg_per_s).toBeLessThan(1);
    expect(summary.duration_s).toBe(4.9);
  });

  it("counts a sustained look-away as one event but ignores a brief glance", () => {
    const frames = [
      ...Array.from({ length: 10 }, () => face()),
      ...Array.from({ length: 12 }, () => face(0.64)), // 1.2s away -> an event
      ...Array.from({ length: 10 }, () => face()),
      ...Array.from({ length: 3 }, () => face(0.64)), // 0.3s -> a glance
      ...Array.from({ length: 10 }, () => face()),
    ];
    const summary = run(frames).summary()!;

    expect(summary.away_events).toBe(1);
    expect(summary.looking_away_ratio).toBeCloseTo(15 / 45, 2);
  });

  it("measures how often the face was out of frame", () => {
    const frames = [...Array.from({ length: 30 }, () => face()), ...Array(10).fill(null)];
    const summary = run(frames as (Landmark[] | null)[]).summary()!;

    expect(summary.face_present_ratio).toBe(0.75);
  });

  it("scores a fidgety head as moving more than a steady one", () => {
    const steady = run(Array.from({ length: 40 }, () => face())).summary()!;
    const fidgety = run(
      Array.from({ length: 40 }, (_, i) => face(0.5 + (i % 2 === 0 ? 0.05 : -0.05))),
    ).summary()!;

    expect(fidgety.head_motion_deg_per_s).toBeGreaterThan(steady.head_motion_deg_per_s + 20);
  });

  it("does not turn a dropped-frame gap into a movement", () => {
    const acc = new CameraAccumulator();
    acc.addFrame(0, face());
    acc.addFrame(5000, face(0.62));
    expect(acc.summary()!.head_motion_deg_per_s).toBe(0);
  });

  it("starts clean after a reset", () => {
    const acc = run([face(), face()]);
    acc.reset();
    expect(acc.summary()).toBeNull();
  });
});
