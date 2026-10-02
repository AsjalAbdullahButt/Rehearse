"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PasswordResetRequestResponse {
  sent: boolean;
  reset_url?: string | null;
}

interface AuthErrorBody {
  error?: { message?: string };
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setDevResetUrl(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as AuthErrorBody | null;
        setError(body?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      const body = (await response.json()) as PasswordResetRequestResponse;
      setStatus("If an account exists for that email, a reset link is ready.");
      setDevResetUrl(body.reset_url ?? null);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-left text-sm">
        <span className="text-muted">Email</span>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "forgot-password-error" : undefined}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      {status ? (
        <p role="status" className="text-mint text-left text-sm">
          {status}
        </p>
      ) : null}

      {devResetUrl ? (
        <Link
          href={devResetUrl}
          className="text-lime text-left text-sm font-medium underline-offset-4 hover:underline"
        >
          Open local reset link
        </Link>
      ) : null}

      {error ? (
        <p id="forgot-password-error" role="alert" className="text-coral text-left text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Please wait..." : "Prepare reset link"}
      </Button>

      <Link href="/sign-in" className="text-muted text-sm underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
