"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Must match apps/api/app/routers/answers.py's MAX_ANSWER_TEXT_CHARS.
export const MAX_ANSWER_TEXT_CHARS = 6000;

const AUTOSAVE_DELAY_MS = 600;

function storageKey(questionId: string): string {
  return `rehearse:answer-draft:${questionId}`;
}

function readDraft(questionId: string): string {
  try {
    return localStorage.getItem(storageKey(questionId)) ?? "";
  } catch {
    // Storage blocked (private mode etc.): the box still works, it just can't be restored.
    return "";
  }
}

/** Forget a question's draft once its answer has been accepted. */
export function clearAnswerDraft(questionId: string): void {
  try {
    localStorage.removeItem(storageKey(questionId));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Typing instead of speaking. The draft is autosaved on this device only (never sent anywhere
 * until you submit), Ctrl/Cmd+Enter submits, and plain Enter just starts a new line. */
export function TypedAnswer({
  questionId,
  isSubmitting,
  onSubmit,
}: {
  questionId: string;
  isSubmitting: boolean;
  onSubmit: (text: string) => void;
}) {
  const hintId = useId();
  const [text, setText] = useState(() => readDraft(questionId));
  const [saved, setSaved] = useState(() => readDraft(questionId).length > 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function handleChange(value: string) {
    setText(value);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (value.trim()) localStorage.setItem(storageKey(questionId), value);
        else localStorage.removeItem(storageKey(questionId));
        setSaved(value.trim().length > 0);
      } catch {
        setSaved(false);
      }
    }, AUTOSAVE_DELAY_MS);
  }

  const words = countWords(text);
  const canSubmit = text.trim().length > 0 && !isSubmitting;

  function submit() {
    if (canSubmit) onSubmit(text);
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={`${hintId}-answer`} className="text-text text-sm font-medium">
        Your answer
      </label>
      <Textarea
        id={`${hintId}-answer`}
        value={text}
        rows={10}
        maxLength={MAX_ANSWER_TEXT_CHARS}
        disabled={isSubmitting}
        aria-describedby={hintId}
        placeholder="Type your answer as you would say it in the interview."
        className="text-base leading-relaxed"
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div id={hintId} className="text-muted flex flex-wrap justify-between gap-2 text-xs">
        <span aria-live="polite">
          {words} {words === 1 ? "word" : "words"}
          {saved ? " · Draft saved on this device" : ""}
        </span>
        <span>Press Ctrl + Enter (⌘ + Enter on Mac) to submit</span>
      </div>
      <Button
        size="lg"
        className="w-full sm:w-auto sm:self-end"
        disabled={!canSubmit}
        loading={isSubmitting}
        onClick={submit}
      >
        {isSubmitting ? "Submitting…" : "Submit answer"}
      </Button>
    </div>
  );
}
