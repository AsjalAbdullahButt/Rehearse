"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface AuthErrorBody {
  error?: { message?: string };
}

interface VerifyEmailFormProps {
  token: string;
}

export function VerifyEmailForm({ token }: VerifyEmailFormProps) {
  const [status, setStatus] = useState<"idle" | "verifying" | "verified" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!token || submittedRef.current) return;
    submittedRef.current = true;

    async function confirm() {
      setStatus("verifying");
      setError(null);
      try {
        const response = await fetch("/api/auth/email-verification/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as AuthErrorBody | null;
          setError(body?.error?.message ?? "This verification link could not be confirmed.");
          setStatus("error");
          return;
        }
        setStatus("verified");
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
        setStatus("error");
      }
    }

    void confirm();
  }, [token]);

  if (!token) {
    return (
      <div className="flex w-full flex-col gap-4 text-left">
        <p role="alert" className="text-coral text-sm">
          This verification link is missing a token.
        </p>
        <Link href="/settings" className="text-lime text-sm font-medium hover:underline">
          Go to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 text-center">
      {status === "verifying" || status === "idle" ? (
        <p role="status" className="text-muted text-sm">
          Confirming your email...
        </p>
      ) : null}
      {status === "verified" ? (
        <>
          <p role="status" className="text-mint text-sm">
            Email verified. Your account now shows as confirmed.
          </p>
          <Link
            href="/settings"
            className="bg-lime-fill text-lime-ink inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] px-6 text-sm font-medium"
          >
            Back to settings
          </Link>
        </>
      ) : null}
      {status === "error" ? (
        <>
          <p role="alert" className="text-coral text-sm">
            {error}
          </p>
          <Link href="/settings" className="text-lime text-sm font-medium hover:underline">
            Request a new link in settings
          </Link>
        </>
      ) : null}
    </div>
  );
}
