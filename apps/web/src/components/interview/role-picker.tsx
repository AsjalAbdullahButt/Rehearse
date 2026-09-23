"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OptionPill } from "@/components/ui/option-pill";
import { DIFFICULTY_OPTIONS, ROLE_OPTIONS, TIME_CAP_OPTIONS } from "@/lib/interview/types";
import type { Difficulty, Role } from "@/lib/interview/types";

export interface RolePickerValue {
  role: Role;
  difficulty: Difficulty;
  timeCapS: number;
}

export function RolePicker({
  initialRole,
  isSubmitting,
  onSubmit,
}: {
  initialRole?: Role;
  isSubmitting: boolean;
  onSubmit: (value: RolePickerValue) => void;
}) {
  const [role, setRole] = useState<Role | null>(initialRole ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [timeCapS, setTimeCapS] = useState<number>(120);

  return (
    <Card className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-text text-2xl font-bold">Start a mock interview</h1>
        <p className="text-muted text-sm">
          Pick a role and difficulty. You&apos;ll answer one question out loud.
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
        <span className="text-muted text-xs font-medium tracking-wide uppercase">Time cap</span>
        <div className="flex flex-wrap gap-2">
          {TIME_CAP_OPTIONS.map((seconds) => (
            <OptionPill
              key={seconds}
              value={seconds.toString()}
              label={seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`}
              selected={timeCapS === seconds}
              onSelect={() => setTimeCapS(seconds)}
            />
          ))}
        </div>
      </div>

      <Button
        size="lg"
        disabled={!role || isSubmitting}
        onClick={() => role && onSubmit({ role, difficulty, timeCapS })}
      >
        {isSubmitting ? "Preparing your question…" : "Start"}
      </Button>
    </Card>
  );
}
