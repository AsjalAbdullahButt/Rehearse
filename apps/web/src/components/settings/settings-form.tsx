"use client";

import { useTheme } from "next-themes";
import { useState } from "react";

import { ResumeUpload } from "@/components/interview/resume-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionPill } from "@/components/ui/option-pill";
import { Textarea } from "@/components/ui/textarea";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import { useSpeechVoices } from "@/hooks/use-speech-voices";
import type { Profile, ResumeExtraction, Role } from "@/lib/interview/types";
import { ROLE_OPTIONS, TIME_CAP_OPTIONS } from "@/lib/interview/types";

const MAX_DISPLAY_NAME_LENGTH = 255;
const MAX_CANDIDATE_BACKGROUND_LENGTH = 8_000;
const MAX_SKILLS = 20;

type SaveStatus = "idle" | "saving" | "saved" | "error";

function splitSkills(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_SKILLS);
}

export function SettingsForm({ initialProfile }: { initialProfile: Profile }) {
  const { theme, setTheme } = useTheme();
  const voices = useSpeechVoices();
  const handleSessionExpiry = useSessionExpiry();

  // next-themes reports `theme` as undefined until after hydration — rendering the theme
  // pills before then would mismatch server vs. client output.
  const mounted = useHasMounted();

  // The dirty-tracking baseline — starts as the server's initial value, then advances to
  // whatever was just persisted after each successful save. Comparing against the *original*
  // initialProfile prop forever would leave "Save changes" wrongly enabled right after a
  // successful save, since the prop itself never updates without a full page reload.
  const [savedProfile, setSavedProfile] = useState(initialProfile);

  const [displayName, setDisplayName] = useState(initialProfile.display_name ?? "");
  const [targetRole, setTargetRole] = useState<Role | "">(
    (initialProfile.target_role as Role | null) ?? "",
  );
  const [answerCapS, setAnswerCapS] = useState(initialProfile.answer_cap_s);
  const [voiceName, setVoiceName] = useState(initialProfile.voice_name ?? "");
  const [voiceRate, setVoiceRate] = useState(initialProfile.voice_rate);
  const [candidateBackground, setCandidateBackground] = useState(
    initialProfile.candidate_background ?? "",
  );
  const [skills, setSkills] = useState(initialProfile.skills?.join(", ") ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    initialProfile.years_experience != null ? String(initialProfile.years_experience) : "",
  );
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Dirty-tracking: disables "Save changes" when nothing has actually changed, instead of
  // always being clickable — the same reasoning AccountPrivacyPanel's own controls follow.
  const isDirty =
    displayName !== (savedProfile.display_name ?? "") ||
    targetRole !== ((savedProfile.target_role as Role | null) ?? "") ||
    answerCapS !== savedProfile.answer_cap_s ||
    voiceName !== (savedProfile.voice_name ?? "") ||
    voiceRate !== savedProfile.voice_rate ||
    candidateBackground !== (savedProfile.candidate_background ?? "") ||
    skills !== (savedProfile.skills?.join(", ") ?? "") ||
    yearsExperience !==
      (savedProfile.years_experience != null ? String(savedProfile.years_experience) : "");

  function handleResumeExtracted(extraction: ResumeExtraction) {
    if (extraction.candidate_background) setCandidateBackground(extraction.candidate_background);
    if (extraction.skills.length > 0) setSkills(extraction.skills.join(", "));
    if (extraction.years_experience !== null) {
      setYearsExperience(String(extraction.years_experience));
    }
  }

  async function handleSave() {
    setStatus("saving");
    try {
      const parsedYearsExperience = Number.parseInt(yearsExperience, 10);
      const trimmedDisplayName = displayName.trim() || null;
      const trimmedBackground = candidateBackground.trim() || null;
      const parsedSkills = skills.trim() ? splitSkills(skills) : null;
      const parsedYears = Number.isFinite(parsedYearsExperience) ? parsedYearsExperience : null;

      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: trimmedDisplayName,
          target_role: targetRole || null,
          answer_cap_s: answerCapS,
          voice_name: voiceName || null,
          voice_rate: voiceRate,
          candidate_background: trimmedBackground,
          skills: parsedSkills,
          years_experience: parsedYears,
        }),
      });
      if (await handleSessionExpiry(response)) return;
      if (response.ok) {
        setStatus("saved");
        setSavedProfile({
          display_name: trimmedDisplayName,
          target_role: targetRole || null,
          answer_cap_s: answerCapS,
          voice_name: voiceName || null,
          voice_rate: voiceRate,
          candidate_background: trimmedBackground,
          skills: parsedSkills,
          years_experience: parsedYears,
        });
      } else {
        setStatus("error");
      }
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
        <label htmlFor="settings-display-name" className="flex flex-col gap-3">
          <span className="text-muted text-xs font-medium tracking-wide uppercase">
            Display name
          </span>
          <Input
            id="settings-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder="How your name shows up in the app"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">Target role</span>
        <p className="text-muted text-xs">
          Pre-selects your role every time you start a mock interview, instead of choosing it from
          scratch each session.
        </p>
        <div className="flex flex-wrap gap-2">
          <OptionPill
            value=""
            label="No default"
            selected={targetRole === ""}
            onSelect={() => setTargetRole("")}
          />
          {ROLE_OPTIONS.map((option) => (
            <OptionPill
              key={option.slug}
              value={option.slug}
              label={option.name}
              selected={targetRole === option.slug}
              onSelect={setTargetRole}
            />
          ))}
        </div>
      </div>

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

      <div className="border-line flex flex-col gap-4 border-t pt-6">
        <div className="flex flex-col gap-1">
          <span className="text-muted text-xs font-medium tracking-wide uppercase">
            Resume &amp; background
          </span>
          <p className="text-muted text-xs">
            Saved here once, it pre-fills every new interview&apos;s background, skills, and years
            of experience automatically — upload a resume, or edit the fields directly, then save.
          </p>
        </div>

        <ResumeUpload onExtracted={handleResumeExtracted} />

        <label htmlFor="settings-candidate-background" className="flex flex-col gap-2">
          <span className="text-muted text-xs font-medium tracking-wide uppercase">
            Your background
          </span>
          <Textarea
            id="settings-candidate-background"
            value={candidateBackground}
            onChange={(event) => setCandidateBackground(event.target.value)}
            maxLength={MAX_CANDIDATE_BACKGROUND_LENGTH}
            placeholder="A short summary of your experience so far."
          />
        </label>

        <label htmlFor="settings-skills" className="flex flex-col gap-2">
          <span className="text-muted text-xs font-medium tracking-wide uppercase">
            Primary skills (comma-separated)
          </span>
          <Input
            id="settings-skills"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            placeholder="e.g. Python, React, SQL"
          />
        </label>

        <label htmlFor="settings-years-experience" className="flex flex-col gap-2">
          <span className="text-muted text-xs font-medium tracking-wide uppercase">
            Years of experience
          </span>
          <Input
            id="settings-years-experience"
            type="number"
            min={0}
            max={80}
            value={yearsExperience}
            onChange={(event) => setYearsExperience(event.target.value)}
            placeholder="e.g. 5"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={status === "saving" || !isDirty}>
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
