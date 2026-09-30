"use client";

import { useState } from "react";

import { ResumeUpload } from "@/components/interview/resume-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionPill } from "@/components/ui/option-pill";
import { Textarea } from "@/components/ui/textarea";
import {
  DIFFICULTY_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  FOCUS_OPTIONS,
  INTERVIEWER_STYLE_OPTIONS,
  QUESTION_COUNT_OPTIONS,
  ROLE_OPTIONS,
  TIME_CAP_OPTIONS,
} from "@/lib/interview/types";
import type {
  Difficulty,
  ExperienceLevel,
  Focus,
  InterviewerStyle,
  ResumeExtraction,
  Role,
  SessionCreateInput,
} from "@/lib/interview/types";

const MAX_COMPANY_LENGTH = 120;
const MAX_INDUSTRY_LENGTH = 120;
const MAX_JOB_DESCRIPTION_LENGTH = 12_000;
const MAX_CANDIDATE_BACKGROUND_LENGTH = 8_000;
const MAX_FOCUS_TOPICS = 10;

function splitList(value: string, max: number): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

const DEFAULT_ANSWER_CAP_S: (typeof TIME_CAP_OPTIONS)[number] = 120;
const DEFAULT_QUESTION_COUNT: (typeof QUESTION_COUNT_OPTIONS)[number] = 5;

function isTimeCapOption(value: number | undefined): value is (typeof TIME_CAP_OPTIONS)[number] {
  return (TIME_CAP_OPTIONS as readonly number[]).includes(value ?? Number.NaN);
}

function isQuestionCountOption(
  value: number | undefined,
): value is (typeof QUESTION_COUNT_OPTIONS)[number] {
  return (QUESTION_COUNT_OPTIONS as readonly number[]).includes(value ?? Number.NaN);
}

export function SessionSetupForm({
  initialRole,
  initialFocus,
  initialDifficulty,
  initialQuestionCount,
  initialAnswerCapS,
  initialCandidateBackground,
  initialSkills,
  initialYearsExperience,
  isSubmitting,
  onSubmit,
}: {
  initialRole?: Role;
  /** A session-focused link (e.g. "Practice this weak area" on the summary page) can hand a
   * specific focus straight through instead of leaving the candidate to reselect "Mixed" and
   * then a category by hand. */
  initialFocus?: Focus;
  /** Set by a "repeat this setup" link (session summary page) — restores the previous session's
   * exact configuration instead of resetting to the defaults below. */
  initialDifficulty?: Difficulty;
  initialQuestionCount?: number;
  /** The candidate's saved default from Settings — pre-fills the time cap instead of always
   * starting at 120s regardless of what they configured there. A "repeat this setup" link can
   * override it with the exact cap that session used. */
  initialAnswerCapS?: number;
  /** The candidate's saved "resume memory" from Settings (uploaded once, reused every session
   * from then on) — pre-fills the same personalization fields a fresh per-session resume
   * upload would, editable here like any other pre-fill. A fresh upload in *this* session
   * (see handleResumeExtracted) still overwrites these, the same as it would overwrite anything
   * typed by hand. */
  initialCandidateBackground?: string | null;
  initialSkills?: string[] | null;
  initialYearsExperience?: number | null;
  isSubmitting: boolean;
  onSubmit: (value: SessionCreateInput) => void;
}) {
  const [role, setRole] = useState<Role | null>(initialRole ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty ?? "medium");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("mid");
  const [focus, setFocus] = useState<Focus>(initialFocus ?? "mixed");
  const [questionCount, setQuestionCount] = useState<(typeof QUESTION_COUNT_OPTIONS)[number]>(
    isQuestionCountOption(initialQuestionCount) ? initialQuestionCount : DEFAULT_QUESTION_COUNT,
  );
  const [answerCapS, setAnswerCapS] = useState<(typeof TIME_CAP_OPTIONS)[number]>(
    isTimeCapOption(initialAnswerCapS) ? initialAnswerCapS : DEFAULT_ANSWER_CAP_S,
  );
  const [company, setCompany] = useState("");
  const hasSavedResumeMemory = Boolean(
    initialCandidateBackground || initialSkills?.length || initialYearsExperience,
  );
  const [showPersonalize, setShowPersonalize] = useState(hasSavedResumeMemory);
  const [industry, setIndustry] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [candidateBackground, setCandidateBackground] = useState(initialCandidateBackground ?? "");
  const [skills, setSkills] = useState(initialSkills?.join(", ") ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    initialYearsExperience != null ? String(initialYearsExperience) : "",
  );
  const [focusTopics, setFocusTopics] = useState("");
  const [interviewerStyle, setInterviewerStyle] = useState<InterviewerStyle | null>(null);

  function handleResumeExtracted(extraction: ResumeExtraction) {
    setShowPersonalize(true);
    if (extraction.candidate_background) setCandidateBackground(extraction.candidate_background);
    if (extraction.skills.length > 0) setSkills(extraction.skills.join(", "));
    if (extraction.years_experience !== null) {
      setYearsExperience(String(extraction.years_experience));
    }
  }

  function handleSubmit() {
    if (!role) return;
    const parsedYearsExperience = Number.parseInt(yearsExperience, 10);
    onSubmit({
      role,
      difficulty,
      experience_level: experienceLevel,
      focus,
      question_count: questionCount,
      answer_cap_s: answerCapS,
      company: company.trim() || undefined,
      industry: industry.trim() || undefined,
      job_description: jobDescription.trim() || undefined,
      candidate_background: candidateBackground.trim() || undefined,
      skills: skills.trim() ? splitList(skills, 20) : undefined,
      years_experience: Number.isFinite(parsedYearsExperience) ? parsedYearsExperience : undefined,
      focus_topics: focusTopics.trim() ? splitList(focusTopics, MAX_FOCUS_TOPICS) : undefined,
      interviewer_style: interviewerStyle ?? undefined,
    });
  }

  return (
    <Card className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-text text-2xl font-bold">Start a mock interview</h1>
        <p className="text-muted text-sm">
          Set up your session. Only role, focus, difficulty, question count and time cap are
          required — everything else helps personalize your questions.
        </p>
      </div>

      <ResumeUpload onExtracted={handleResumeExtracted} />
      {hasSavedResumeMemory ? (
        <p className="text-muted -mt-4 text-xs">
          Using the background, skills, and experience saved in your{" "}
          <a href="/settings" className="text-lime hover:underline">
            Settings
          </a>
          . Upload a different resume above, or edit the fields below, to change it for this session
          only.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">Role</span>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((option) => (
            <OptionPill
              key={option.slug}
              value={option.slug}
              label={option.name}
              selected={role === option.slug}
              onSelect={setRole}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          Experience level
        </span>
        <div className="flex flex-wrap gap-2">
          {EXPERIENCE_LEVEL_OPTIONS.map((option) => (
            <OptionPill
              key={option.slug}
              value={option.slug}
              label={option.name}
              selected={experienceLevel === option.slug}
              onSelect={setExperienceLevel}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          Interview focus
        </span>
        <div className="flex flex-wrap gap-2">
          {FOCUS_OPTIONS.map((option) => (
            <OptionPill
              key={option.slug}
              value={option.slug}
              label={option.name}
              selected={focus === option.slug}
              onSelect={setFocus}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">Difficulty</span>
        <div className="flex flex-wrap gap-2">
          {DIFFICULTY_OPTIONS.map((option) => (
            <OptionPill
              key={option.slug}
              value={option.slug}
              label={option.name}
              selected={difficulty === option.slug}
              onSelect={setDifficulty}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          Number of questions
        </span>
        <div className="flex flex-wrap gap-2">
          {QUESTION_COUNT_OPTIONS.map((count) => (
            <OptionPill
              key={count}
              value={count.toString()}
              label={`${count}`}
              selected={questionCount === count}
              onSelect={() => setQuestionCount(count)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          Answer time cap
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
          Target company (optional)
        </span>
        <Input
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          maxLength={MAX_COMPANY_LENGTH}
          placeholder="e.g. Acme Corp"
        />
      </div>

      <div className="border-line flex flex-col gap-4 border-t pt-6">
        <button
          type="button"
          onClick={() => setShowPersonalize((value) => !value)}
          className="text-text text-left text-sm font-medium"
          aria-expanded={showPersonalize}
        >
          {showPersonalize ? "− Hide personalization" : "+ Personalize further (optional)"}
        </button>

        {showPersonalize ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-muted text-xs font-medium tracking-wide uppercase">
                Industry
              </span>
              <Input
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                maxLength={MAX_INDUSTRY_LENGTH}
                placeholder="e.g. Fintech"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-muted text-xs font-medium tracking-wide uppercase">
                Job description
              </span>
              <Textarea
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                maxLength={MAX_JOB_DESCRIPTION_LENGTH}
                placeholder="Paste the job description you're preparing for."
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-muted text-xs font-medium tracking-wide uppercase">
                Your background
              </span>
              <Textarea
                value={candidateBackground}
                onChange={(event) => setCandidateBackground(event.target.value)}
                maxLength={MAX_CANDIDATE_BACKGROUND_LENGTH}
                placeholder="A short summary of your experience so far."
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-muted text-xs font-medium tracking-wide uppercase">
                Primary skills (comma-separated)
              </span>
              <Input
                value={skills}
                onChange={(event) => setSkills(event.target.value)}
                placeholder="e.g. Python, React, SQL"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-muted text-xs font-medium tracking-wide uppercase">
                Years of experience
              </span>
              <Input
                type="number"
                min={0}
                max={80}
                value={yearsExperience}
                onChange={(event) => setYearsExperience(event.target.value)}
                placeholder="e.g. 5"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-muted text-xs font-medium tracking-wide uppercase">
                Focus topics (comma-separated, up to {MAX_FOCUS_TOPICS})
              </span>
              <Input
                value={focusTopics}
                onChange={(event) => setFocusTopics(event.target.value)}
                placeholder="e.g. system design, caching"
              />
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-muted text-xs font-medium tracking-wide uppercase">
                Interviewer style
              </span>
              <div className="flex flex-wrap gap-2">
                {INTERVIEWER_STYLE_OPTIONS.map((option) => (
                  <OptionPill
                    key={option.slug}
                    value={option.slug}
                    label={option.name}
                    selected={interviewerStyle === option.slug}
                    onSelect={setInterviewerStyle}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Button size="lg" disabled={!role || isSubmitting} onClick={handleSubmit}>
        {isSubmitting ? "Preparing your question…" : "Start"}
      </Button>
    </Card>
  );
}
