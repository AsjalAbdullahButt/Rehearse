"use client";

import type { CameraCoachStatus } from "@/hooks/use-camera-coach";

/** The opt-in control for visual coaching. Off by default, explicit about what happens to the
 * video (nothing leaves the device) and what the feature is for. */
export function CameraCoachPanel({
  enabled,
  status,
  onToggle,
  attachVideo,
  disabled,
}: {
  enabled: boolean;
  status: CameraCoachStatus;
  onToggle: (enabled: boolean) => void;
  attachVideo: (element: HTMLVideoElement | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="border-line flex w-full max-w-sm flex-col gap-3 rounded-[var(--radius-tile)] border p-3 text-left">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="mt-1 size-4"
        />
        <span className="flex flex-col gap-1">
          <span className="text-text text-sm font-medium">Visual coaching (optional)</span>
          <span className="text-muted text-xs">
            Uses your camera to check whether you stay in frame and face the camera. Video is
            analysed on your device and is not saved or uploaded; only a few summary numbers are
            kept with your answer. It is presentation coaching only and never changes your scores.
          </span>
        </span>
      </label>

      {enabled ? (
        <div className="flex flex-col gap-2">
          <video
            ref={attachVideo}
            autoPlay
            muted
            playsInline
            aria-label="Your camera preview"
            className="aspect-[4/3] w-full -scale-x-100 rounded-[var(--radius-tile)] bg-black object-cover"
          />
          <p role="status" className="text-muted text-xs">
            {status === "starting"
              ? "Starting camera and loading the on-device model…"
              : status === "ready"
                ? "Camera coach is on. Preview stays on your device."
                : "Camera coach could not start (camera blocked or unsupported). You can continue without it."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
