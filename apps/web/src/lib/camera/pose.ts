// On-device head-pose summary for the optional camera coach. Landmarks go in, a handful of numbers
// come out (see CameraSummary in apps/api/app/schemas/delivery.py). No frame, image or landmark
// leaves this module, and none of it says anything about honesty, confidence or emotion — it only
// answers "was the head turned toward the camera, and how still was it?".

export interface Landmark {
  x: number;
  y: number;
}

// Indices into MediaPipe's 478-point face mesh.
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

/** Beyond these angles the head counts as turned away from the camera. */
export const AWAY_YAW_DEG = 25;
export const AWAY_PITCH_DEG = 20;
/** A look-away has to last this long to count as an event (ignores a quick glance or blink). */
export const MIN_AWAY_EVENT_S = 0.7;

export interface HeadPose {
  yawDeg: number;
  pitchDeg: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Approximate head turn and tilt from where the nose sits between the cheek/forehead-chin
 * extremes. A geometric estimate, good enough to tell "facing the screen" from "turned away" —
 * not a calibrated measurement. Null if the landmarks are degenerate. */
export function headPoseFromLandmarks(landmarks: readonly Landmark[]): HeadPose | null {
  const nose = landmarks[NOSE_TIP];
  const forehead = landmarks[FOREHEAD];
  const chin = landmarks[CHIN];
  const left = landmarks[LEFT_CHEEK];
  const right = landmarks[RIGHT_CHEEK];
  if (!nose || !forehead || !chin || !left || !right) return null;

  const width = right.x - left.x;
  const height = chin.y - forehead.y;
  if (Math.abs(width) < 1e-4 || Math.abs(height) < 1e-4) return null;

  const yawRatio = (nose.x - (left.x + right.x) / 2) / width;
  const pitchRatio = (nose.y - (forehead.y + chin.y) / 2) / height;
  const toDeg = (ratio: number) => (Math.asin(clamp(ratio * 2, -1, 1)) * 180) / Math.PI;
  return { yawDeg: toDeg(yawRatio), pitchDeg: toDeg(pitchRatio) };
}

export function isLookingAway(pose: HeadPose): boolean {
  return Math.abs(pose.yawDeg) > AWAY_YAW_DEG || Math.abs(pose.pitchDeg) > AWAY_PITCH_DEG;
}

export interface CameraSummary {
  frames: number;
  duration_s: number;
  face_present_ratio: number;
  looking_away_ratio: number;
  away_events: number;
  head_motion_deg_per_s: number;
}

export class CameraAccumulator {
  private frames = 0;
  private present = 0;
  private away = 0;
  private awayEvents = 0;
  private awayStartedAt: number | null = null;
  private awayCounted = false;
  private firstT: number | null = null;
  private lastT = 0;
  private previous: { t: number; pose: HeadPose } | null = null;
  private motionDegrees = 0;
  private motionSeconds = 0;

  reset(): void {
    this.frames = 0;
    this.present = 0;
    this.away = 0;
    this.awayEvents = 0;
    this.awayStartedAt = null;
    this.awayCounted = false;
    this.firstT = null;
    this.lastT = 0;
    this.previous = null;
    this.motionDegrees = 0;
    this.motionSeconds = 0;
  }

  /** `landmarks` is null when no face was found in the frame; `tMs` is a monotonic timestamp. */
  addFrame(tMs: number, landmarks: readonly Landmark[] | null): void {
    this.frames += 1;
    this.firstT ??= tMs;
    this.lastT = tMs;

    const pose = landmarks ? headPoseFromLandmarks(landmarks) : null;
    if (!pose) {
      this.previous = null;
      this.awayStartedAt = null;
      this.awayCounted = false;
      return;
    }
    this.present += 1;

    if (isLookingAway(pose)) {
      this.away += 1;
      this.awayStartedAt ??= tMs;
      if (!this.awayCounted && (tMs - this.awayStartedAt) / 1000 >= MIN_AWAY_EVENT_S) {
        this.awayEvents += 1;
        this.awayCounted = true;
      }
    } else {
      this.awayStartedAt = null;
      this.awayCounted = false;
    }

    if (this.previous) {
      const dt = (tMs - this.previous.t) / 1000;
      // Skip a gap (a dropped frame run) rather than counting it as one huge, slow movement.
      if (dt > 0 && dt < 1) {
        this.motionDegrees += Math.hypot(
          pose.yawDeg - this.previous.pose.yawDeg,
          pose.pitchDeg - this.previous.pose.pitchDeg,
        );
        this.motionSeconds += dt;
      }
    }
    this.previous = { t: tMs, pose };
  }

  summary(): CameraSummary | null {
    if (this.frames === 0 || this.firstT === null) return null;
    const round = (value: number, digits: number) => {
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    };
    return {
      frames: this.frames,
      duration_s: round((this.lastT - this.firstT) / 1000, 1),
      face_present_ratio: round(this.present / this.frames, 3),
      looking_away_ratio: this.present === 0 ? 0 : round(this.away / this.present, 3),
      away_events: this.awayEvents,
      head_motion_deg_per_s:
        this.motionSeconds === 0 ? 0 : round(this.motionDegrees / this.motionSeconds, 1),
    };
  }
}
