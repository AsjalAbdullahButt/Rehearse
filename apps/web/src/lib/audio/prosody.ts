// On-device voice measurement. Frames of raw microphone samples go in; only a handful of summary
// numbers come out (see ProsodySummary in apps/api/app/schemas/delivery.py). The audio itself is
// never kept, uploaded or analysed anywhere but here, frame by frame, in memory.

/** Below this level a frame is treated as silence/background and ignored for voice statistics. */
export const VOICED_DB_THRESHOLD = -45;
/** A pitch estimate is only trusted when the autocorrelation peak is this clear (0-1). */
const MIN_PITCH_CLARITY = 0.5;
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;
/** Fewer pitched frames than this and the pitch spread isn't meaningful. */
const MIN_PITCHED_FRAMES = 15;

export interface ProsodySummary {
  frames: number;
  voiced_frames: number;
  pitch_std_semitones: number | null;
  pitch_median_hz: number | null;
  energy_cv: number;
  volume_std_db: number;
  mean_db: number;
}

export function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

export function toDb(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1e-6));
}

/** Fundamental frequency by normalised autocorrelation, or null for an unvoiced/unclear frame. */
export function detectPitchHz(samples: Float32Array, sampleRate: number): number | null {
  const minLag = Math.floor(sampleRate / MAX_PITCH_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_PITCH_HZ), samples.length - 1);
  if (maxLag <= minLag) return null;

  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  if (energy === 0) return null;

  let bestLag = -1;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    for (let i = 0; i < samples.length - lag; i++) {
      correlation += samples[i]! * samples[i + lag]!;
    }
    // Normalised against the whole frame's energy, so a clean periodic signal peaks near 1.
    const normalised = correlation / energy;
    if (normalised > bestCorrelation) {
      bestCorrelation = normalised;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestCorrelation < MIN_PITCH_CLARITY) return null;
  return sampleRate / bestLag;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export class ProsodyAccumulator {
  private frames = 0;
  private rmsValues: number[] = [];
  private dbValues: number[] = [];
  private pitches: number[] = [];

  reset(): void {
    this.frames = 0;
    this.rmsValues = [];
    this.dbValues = [];
    this.pitches = [];
  }

  addFrame(samples: Float32Array, sampleRate: number): void {
    this.frames += 1;
    const rms = rmsOf(samples);
    const db = toDb(rms);
    if (db < VOICED_DB_THRESHOLD) return;
    this.rmsValues.push(rms);
    this.dbValues.push(db);
    const pitch = detectPitchHz(samples, sampleRate);
    if (pitch !== null) this.pitches.push(pitch);
  }

  /** Null until there is any voiced audio at all; the server decides whether it is enough. */
  summary(): ProsodySummary | null {
    if (this.rmsValues.length === 0) return null;
    const pitched = this.pitches.length >= MIN_PITCHED_FRAMES;
    const medianHz = pitched ? median(this.pitches) : null;
    const semitoneStd =
      pitched && medianHz !== null
        ? std(this.pitches.map((hz) => 12 * Math.log2(hz / medianHz)))
        : null;
    const meanRms = mean(this.rmsValues);
    return {
      frames: this.frames,
      voiced_frames: this.rmsValues.length,
      pitch_std_semitones: semitoneStd === null ? null : round(semitoneStd, 2),
      pitch_median_hz: medianHz === null ? null : round(medianHz, 1),
      energy_cv: round(std(this.rmsValues) / meanRms, 3),
      volume_std_db: round(std(this.dbValues), 2),
      mean_db: round(mean(this.dbValues), 1),
    };
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
