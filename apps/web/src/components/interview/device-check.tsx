import { MicOrb } from "@/components/interview/mic-orb";
import { Waveform } from "@/components/interview/waveform";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CheckState = "ok" | "warn" | "pending";

function CheckRow({ label, state, detail }: { label: string; state: CheckState; detail: string }) {
  const glyph = state === "ok" ? "✓" : state === "warn" ? "!" : "·";
  return (
    <li className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-text">{label}</span>
      <span
        className={cn(
          "flex items-center gap-2",
          state === "ok" ? "text-mint" : state === "warn" ? "text-amber" : "text-muted",
        )}
      >
        <span aria-hidden="true" className="font-bold">
          {glyph}
        </span>
        {detail}
      </span>
    </li>
  );
}

/** Pre-interview readiness screen: browser support, connection and a live microphone level test.
 * Presentational — the interview flow owns the recorder and decides what "working" means. */
export function DeviceCheck({
  browserSupported,
  online,
  micLive,
  micHeard,
  micStarting,
  micError,
  analyser,
  onTestMic,
  onContinue,
}: {
  browserSupported: boolean;
  online: boolean;
  /** The test recording is currently capturing. */
  micLive: boolean;
  /** Sound above the speaking threshold was detected during the test. */
  micHeard: boolean;
  micStarting: boolean;
  micError: string | null;
  analyser: AnalyserNode | null;
  onTestMic: () => void;
  onContinue: () => void;
}) {
  const micState: CheckState = micHeard ? "ok" : micError ? "warn" : "pending";
  const micDetail = micHeard
    ? "Working"
    : micError
      ? "Needs attention"
      : micLive
        ? "Listening… say something"
        : "Not tested yet";
  const allGood = browserSupported && online && micHeard;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <Card className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-display text-text text-xl font-bold">Check your setup</h1>
          <p className="text-muted text-sm">
            A quick test so nothing surprises you mid-answer. This only happens once per interview.
          </p>
        </div>

        <ul className="divide-line divide-y" aria-label="Setup checks">
          <CheckRow
            label="Browser"
            state={browserSupported ? "ok" : "warn"}
            detail={browserSupported ? "Supported" : "Recording isn’t supported here"}
          />
          <CheckRow
            label="Connection"
            state={online ? "ok" : "warn"}
            detail={online ? "Online" : "Offline — reconnect to continue"}
          />
          <CheckRow label="Microphone" state={micState} detail={micDetail} />
        </ul>

        <div className="flex flex-col items-center gap-4">
          <MicOrb size={88} recording={micLive} />
          {micLive ? <Waveform analyser={analyser} /> : null}
        </div>

        {!browserSupported ? (
          <p role="alert" className="text-amber text-center text-sm">
            This browser can’t record audio. Open Rehearse in a current version of Chrome, Edge,
            Firefox or Safari to take a voice interview.
          </p>
        ) : null}
        {micError ? (
          <p role="alert" className="text-coral text-center text-sm">
            {micError}
          </p>
        ) : null}
        {allGood ? (
          <p role="status" className="text-mint text-center text-sm">
            Everything looks good.
          </p>
        ) : null}

        <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
          {!micLive ? (
            <Button
              variant="secondary"
              loading={micStarting}
              disabled={!browserSupported}
              onClick={onTestMic}
            >
              {micStarting ? "Requesting mic access…" : micError ? "Try again" : "Test my mic"}
            </Button>
          ) : null}
          <Button
            variant={micHeard || micLive ? "primary" : "ghost"}
            disabled={!browserSupported || !online}
            onClick={onContinue}
          >
            {micHeard ? "Start interview" : micLive ? "Continue anyway" : "Skip check"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
