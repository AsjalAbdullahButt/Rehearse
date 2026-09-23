"use client";

import { useTheme } from "next-themes";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OptionPill } from "@/components/ui/option-pill";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useSpeechVoices } from "@/hooks/use-speech-voices";
import type { Profile } from "@/lib/interview/types";
import { TIME_CAP_OPTIONS } from "@/lib/interview/types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function SettingsForm({ initialProfile }: { initialProfile: Profile }) {
  const { theme, setTheme } = useTheme();
  const voices = useSpeechVoices();

  // next-themes reports `theme` as undefined until after hydration — rendering the theme
  // pills before then would mismatch server vs. client output.
  const mounted = useHasMounted();

  const [answerCapS, setAnswerCapS] = useState(initialProfile.answer_cap_s);
  const [voiceName, setVoiceName] = useState(initialProfile.voice_name ?? "");
  const [voiceRate, setVoiceRate] = useState(initialProfile.voice_rate);
  const [status, setStatus] = useState<SaveStatus>("idle");

  async function handleSave() {
    setStatus("saving");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer_cap_s: answerCapS,
          voice_name: voiceName || null,
          voice_rate: voiceRate,
        }),
      });
      setStatus(response.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  function handlePreviewVoice() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance("This is how your interviewer will sound.");
    const voice = voices.find((candidate) => candidate.name === voiceName);
    if (voice) utterance.voice = voice;
    utterance.rate = voiceRate;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return (
    <Card className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <h1 className="font-display text-text text-2xl font-bold">Settings</h1>

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          Default time cap
        </span>
        <div className="flex flex-wrap gap-2">
          {TIME_CAP_OPTIONS.map((seconds) => (
            <OptionPill
              key={seconds}
              value={seconds.toString()}
              label={seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`}
              selected={answerCapS === seconds}
              onSelect={() => setAnswerCapS(seconds)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          Interviewer voice
        </span>

        {voices.length === 0 ? (
          <p className="text-muted text-sm">
            No voices are available from this browser yet — your system TTS voices will be used once
            they load.
          </p>
        ) : (
          <select
            value={voiceName}
            onChange={(event) => setVoiceName(event.target.value)}
            className="border-line bg-surface-2 text-text focus-visible:outline-lime h-11 rounded-[var(--radius-tile)] border px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <option value="">Browser default</option>
            {voices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        )}

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">Speaking rate: {voiceRate.toFixed(2)}x</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={voiceRate}
            onChange={(event) => setVoiceRate(Number(event.target.value))}
            className="accent-lime"
          />
        </label>

        <Button variant="secondary" size="sm" onClick={handlePreviewVoice} className="w-fit">
          Preview voice
        </Button>
      </div>

      {mounted ? (
        <div className="flex flex-col gap-3">
          <span className="text-muted text-xs font-medium tracking-wide uppercase">Theme</span>
          <div className="flex gap-2">
            <OptionPill value="dark" label="Dark" selected={theme === "dark"} onSelect={setTheme} />
            <OptionPill
              value="light"
              label="Light"
              selected={theme === "light"}
              onSelect={setTheme}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save changes"}
        </Button>
        {status === "saved" ? <span className="text-mint text-sm">Saved</span> : null}
        {status === "error" ? (
          <span className="text-coral text-sm">Couldn&apos;t save. Try again.</span>
        ) : null}
      </div>
    </Card>
  );
}
