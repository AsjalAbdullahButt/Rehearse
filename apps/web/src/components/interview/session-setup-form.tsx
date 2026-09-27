"use client";

import { useState } from "react";

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

export function SessionSetupForm({
  initialRole,
  isSubmitting,
  onSubmit,
}: {
  initialRole?: Role;
  isSubmitting: boolean;
  onSubmit: (value: SessionCreateInput) => void;
}) {
  const [role, setRole] = useState<Role | null>(initialRole ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>("mid");
  const [focus, setFocus] = useState<Focus>("mixed");
  const [questionCount, setQuestionCount] = useState<(typeof QUESTION_COUNT_OPTIONS)[number]>(5);
  const [answerCapS, setAnswerCapS] = useState<(typeof TIME_CAP_OPTIONS)[number]>(120);
  const [company, setCompany] = useState("");
  const [showPersonalize, setShowPersonalize] = useState(false);
  const [industry, setIndustry] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [candidateBackground, setCandidateBackground] = useState("");
  const [skills, setSkills] = useState("");
  const [focusTopics, setFocusTopics] = useState("");
  const [interviewerStyle, setInterviewerStyle] = useState<InterviewerStyle | null>(null);

  function handleSubmit() {
    if (!role) return;
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
