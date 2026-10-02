"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { NEW_PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_HINT } from "@/lib/auth/password-policy";

interface AuthErrorBody {
  error?: { message?: string };
}

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as AuthErrorBody | null;
        setError(body?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      router.push("/sign-in?password=changed");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex w-full flex-col gap-4 text-left">
        <p role="alert" className="text-coral text-sm">
          This reset link is missing a token.
        </p>
        <Link href="/forgot-password" className="text-lime text-sm font-medium hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-left text-sm">
        <label htmlFor="reset-password" className="flex flex-col gap-1.5">
          <span className="text-muted">New password</span>
          <PasswordInput
            id="reset-password"
            required
            minLength={NEW_PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            aria-invalid={error ? true : undefined}
            aria-describedby={
              ["reset-password-hint", error ? "reset-password-error" : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className="pr-16"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <span id="reset-password-hint" className="text-muted text-xs">
          {PASSWORD_REQUIREMENTS_HINT}
          <span className="mt-1 block" aria-live="polite">
            {password.length >= NEW_PASSWORD_MIN_LENGTH
              ? "Minimum length reached."
              : `${NEW_PASSWORD_MIN_LENGTH - password.length} more characters needed.`}
          </span>
        </span>
      </div>

      {error ? (
        <p id="reset-password-error" role="alert" className="text-coral text-left text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Please wait..." : "Update password"}
      </Button>
    </form>
  );
}
