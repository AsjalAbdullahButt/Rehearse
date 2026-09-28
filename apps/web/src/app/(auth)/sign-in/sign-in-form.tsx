"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NEW_PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_HINT } from "@/lib/auth/password-policy";
import { sanitizeNextPath } from "@/lib/utils";

type Mode = "login" | "register";

interface AuthErrorBody {
  error?: { code?: string; message?: string };
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get("next"), "/interview");

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { email, password }
          : { email, password, display_name: displayName || undefined };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as AuthErrorBody | null;
        setError(body?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    // A validation error from one mode (e.g. a password-policy message from "Create account")
    // shouldn't keep showing after switching to "Sign in", where it no longer applies.
    setError(null);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div
        role="tablist"
        aria-label="Sign in or create account"
        className="border-line bg-surface-2 flex justify-center gap-1 rounded-[var(--radius-pill)] border p-1 text-sm"
      >
        <button
          type="button"
          role="tab"
          id="sign-in-form-tab-login"
          aria-selected={mode === "login"}
          aria-controls="sign-in-form-panel"
          onClick={() => switchMode("login")}
          className={
            mode === "login"
              ? "bg-lime text-lime-ink flex-1 rounded-[var(--radius-pill)] px-4 py-1.5 font-medium"
              : "text-muted flex-1 rounded-[var(--radius-pill)] px-4 py-1.5"
          }
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          id="sign-in-form-tab-register"
          aria-selected={mode === "register"}
          aria-controls="sign-in-form-panel"
          onClick={() => switchMode("register")}
          className={
            mode === "register"
              ? "bg-lime text-lime-ink flex-1 rounded-[var(--radius-pill)] px-4 py-1.5 font-medium"
              : "text-muted flex-1 rounded-[var(--radius-pill)] px-4 py-1.5"
          }
        >
          Create account
        </button>
      </div>

      <form
        id="sign-in-form-panel"
        role="tabpanel"
        aria-labelledby={mode === "login" ? "sign-in-form-tab-login" : "sign-in-form-tab-register"}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {mode === "register" && (
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="text-muted">Name (optional)</span>
            <Input
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-left text-sm">
          <span className="text-muted">Email</span>
          <Input
            type="email"
            inputMode="email"
            required
            autoComplete="email"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "sign-in-form-error" : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-left text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted">Password</span>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                required
                // Only enforced client-side for a NEW password (registration) — an existing
                // account may still have a shorter password from before this policy existed,
                // and login must keep accepting it (the API's own LoginRequest deliberately has
                // no minimum for the same reason).
                minLength={mode === "register" ? NEW_PASSWORD_MIN_LENGTH : undefined}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                aria-invalid={error ? true : undefined}
                aria-describedby={
                  [
                    mode === "register" ? "sign-in-form-password-hint" : null,
                    error ? "sign-in-form-error" : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className="pr-16"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="text-muted hover:text-text focus-visible:outline-lime absolute inset-y-0 right-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          {mode === "register" && (
            <span id="sign-in-form-password-hint" className="text-muted text-xs">
              {PASSWORD_REQUIREMENTS_HINT}
            </span>
          )}
        </div>

        {error && (
          <p id="sign-in-form-error" role="alert" className="text-coral text-sm">
            {error}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
