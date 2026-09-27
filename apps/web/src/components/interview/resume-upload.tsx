"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import type { ResumeExtraction } from "@/lib/interview/types";

type Status = "idle" | "parsing" | "error";

// Must match apps/api/app/core/limits.py's MAX_RESUME_BYTES.
const MAX_RESUME_BYTES = 2 * 1024 * 1024;

async function parseErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? "Couldn't read that file. Please try again.";
}

/** Lets a candidate upload a resume PDF to pre-fill SessionSetupForm's background/skills/years-
 * of-experience fields instead of typing them by hand — every field it fills stays editable, and
 * nothing is submitted until the candidate presses Start. The file and its extracted text are
 * never stored (see apps/api/app/routers/resume.py); only the small extracted summary the user
 * can see and edit ever leaves this request. */
export function ResumeUpload({
  onExtracted,
}: {
  onExtracted: (extraction: ResumeExtraction) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSessionExpiry = useSessionExpiry();
  const { push } = useToast();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    setError(null);

    if (file.type !== "application/pdf") {
      setStatus("error");
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setStatus("error");
      setError("That file is larger than 2MB.");
      return;
    }

    setStatus("parsing");
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.set("resume", file);
      const response = await fetch("/api/interview/resume", { method: "POST", body: formData });
      if (await handleSessionExpiry(response)) return;
      if (!response.ok) {
        setStatus("error");
        setError(await parseErrorMessage(response));
        return;
      }
      const extraction = (await response.json()) as ResumeExtraction;
      setStatus("idle");
      onExtracted(extraction);
      push("Filled in your background, skills, and experience from your resume — review below.");
    } catch {
      setStatus("error");
      setError("Couldn't reach the server. Please try again.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-label="Upload resume PDF"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFileSelected(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={status === "parsing"}
          onClick={() => inputRef.current?.click()}
        >
          {status === "parsing" ? "Reading your resume…" : "Upload resume (PDF, optional)"}
        </Button>
        {fileName && status !== "error" ? (
          <span className="text-muted text-xs">{fileName}</span>
        ) : null}
      </div>
      <p className="text-muted text-xs">
        We&apos;ll pre-fill your background, skills, and years of experience below — review and edit
        anything before you start. The file itself is never stored.
      </p>
      {status === "error" && error ? (
        <span role="alert" className="text-coral text-sm">
          {error}
        </span>
      ) : null}
    </div>
  );
}
