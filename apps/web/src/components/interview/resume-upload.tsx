"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState, type DragEvent } from "react";

import { useToast } from "@/components/ui/toast";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import type { ResumeExtraction } from "@/lib/interview/types";
import { cn } from "@/lib/utils";

type Status = "idle" | "parsing" | "error";

// Must match apps/api/app/core/limits.py's MAX_RESUME_FILE_BYTES.
const MAX_RESUME_BYTES = 2 * 1024 * 1024;

const ACCEPTED_TYPE = "application/pdf";
const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/** Only PDF is actually parseable server-side (see apps/api/app/services/resume_parser.py) —
 * this names the specific wrong format a candidate tried, rather than one generic "not a PDF"
 * message, so the fix is obvious without them having to guess. */
function describeUnsupportedFile(file: File): string {
  const type = file.type;
  const name = file.name.toLowerCase();

  if (WORD_MIME_TYPES.has(type) || name.endsWith(".doc") || name.endsWith(".docx")) {
    return "Word documents aren't supported yet — please save your resume as a PDF and upload that instead.";
  }
  if (type.startsWith("image/") || /\.(jpe?g|png|heic|gif|webp)$/.test(name)) {
    return "Images aren't supported — please upload your resume as a PDF instead.";
  }
  return "Only PDF files are supported — please upload your resume as a PDF.";
}

interface UploadError {
  message: string;
  /** "resume_content_not_recognized" (see apps/api/app/services/llm.py's
   * _reject_if_not_resume) gets its own calmer, amber "heads up" treatment below instead of the
   * red failure styling every other error uses — the upload itself worked fine; the file just
   * wasn't a resume (a certificate, transcript, etc.), which isn't a "something broke" moment. */
  code: string | null;
}

const CONTENT_NOT_RECOGNIZED_CODE = "resume_content_not_recognized";

async function parseError(response: Response): Promise<UploadError> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
  } | null;
  return {
    message: body?.error?.message ?? "Couldn't read that file. Please try again.",
    code: body?.error?.code ?? null,
  };
}

const UploadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
    aria-hidden="true"
  >
    <path d="M12 15V4M12 4 8 8M12 4l4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);

const SpinnerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 animate-spin" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth={2} />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
  </svg>
);

const InfoIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4 shrink-0"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" />
  </svg>
);

const CheckIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-mint h-4 w-4 shrink-0"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** Lets a candidate upload a resume PDF to pre-fill SessionSetupForm's background/skills/years-
 * of-experience fields instead of typing them by hand — every field it fills stays editable, and
 * nothing is submitted until the candidate presses Start. The file and its extracted text are
 * never stored (see apps/api/app/routers/resume.py); only the small extracted summary the user
 * can see and edit ever leaves this request. A drag-and-drop target as well as a click-to-browse
 * button — both funnel into the same hidden file input, so keyboard/screen-reader users get the
 * same accessible control either way. */
export function ResumeUpload({
  onExtracted,
}: {
  onExtracted: (extraction: ResumeExtraction) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSessionExpiry = useSessionExpiry();
  const { push } = useToast();
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<UploadError | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  async function handleFileSelected(file: File) {
    setError(null);

    if (file.type !== ACCEPTED_TYPE) {
      setStatus("error");
      setError({ message: describeUnsupportedFile(file), code: null });
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setStatus("error");
      setError({ message: "That file is larger than 2MB — try a smaller PDF.", code: null });
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
        setError(await parseError(response));
        return;
      }
      const extraction = (await response.json()) as ResumeExtraction;
      setStatus("idle");
      onExtracted(extraction);
      push("Filled in your background, skills, and experience from your resume — review below.");
    } catch {
      setStatus("error");
      setError({ message: "Couldn't reach the server. Please try again.", code: null });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (status === "parsing") return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFileSelected(file);
  }

  const isBusy = status === "parsing";
  const isContentWarning = status === "error" && error?.code === CONTENT_NOT_RECOGNIZED_CODE;
  const isHardError = status === "error" && !isContentWarning;

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

      <motion.div
        onDragOver={(event) => {
          event.preventDefault();
          if (!isBusy) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        animate={{ scale: isDragOver && !reduceMotion ? 1.015 : 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.15, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-[var(--radius-tile)] border border-dashed px-6 py-6 text-center transition-colors duration-200",
          isDragOver && "border-lime bg-lime/5",
          !isDragOver && isHardError && "border-coral/40 bg-coral/5",
          !isDragOver && isContentWarning && "border-amber/40 bg-amber/5",
          !isDragOver && status !== "error" && "border-line bg-surface-2/40",
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          aria-label="Upload resume"
          className={cn(
            "focus-visible:outline-lime flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none",
            isHardError && "bg-coral/10 text-coral",
            isContentWarning && "bg-amber/10 text-amber",
            !isHardError && !isContentWarning && "bg-lime/10 text-lime hover:bg-lime/20",
          )}
        >
          {isBusy ? <SpinnerIcon /> : isContentWarning ? <InfoIcon /> : <UploadIcon />}
        </button>

        <div className="flex flex-col items-center gap-1">
          <p className="text-text text-sm font-medium">
            {isBusy ? "Reading your resume…" : "Drag & drop your resume, or"}
          </p>
          {!isBusy && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-lime focus-visible:outline-lime text-sm font-medium underline-offset-4 hover:underline hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Browse files
            </button>
          )}
          <span className="text-muted text-xs">PDF only · up to 2MB · optional</span>
        </div>

        <AnimatePresence>
          {fileName && status !== "error" && !isBusy && (
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="bg-surface border-line flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-1 text-xs"
            >
              <CheckIcon />
              <span className="text-text max-w-[16rem] truncate">{fileName}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <p className="text-muted text-xs">
        We&apos;ll pre-fill your background, skills, and years of experience below — review and edit
        anything before you start. The file itself is never stored.
      </p>

      <AnimatePresence>
        {status === "error" && error && (
          <motion.div
            role="alert"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className={cn(
              "flex items-start gap-2 rounded-[var(--radius-tile)] border px-3 py-2 text-sm",
              isContentWarning
                ? "border-amber/30 bg-amber/5 text-amber"
                : "border-coral/30 bg-coral/5 text-coral",
            )}
          >
            {isContentWarning && (
              <span className="mt-0.5">
                <InfoIcon />
              </span>
            )}
            <span>{error.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
