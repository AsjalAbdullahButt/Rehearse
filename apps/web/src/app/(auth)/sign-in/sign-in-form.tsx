"use client";

import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Input } from "@/components/ui/input";
import { NEW_PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_HINT } from "@/lib/auth/password-policy";
import { sanitizeNextPath } from "@/lib/utils";

type Mode = "login" | "register";

interface AuthErrorBody {
  error?: { code?: string; message?: string };
}

export function SignInForm() {
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get("next"), "/interview");

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      // A real bug this avoids: `router.push()` immediately followed by `router.refresh()`
      // races Next's client router — `refresh()` can invalidate/re-render the *current* route
      // (still `/sign-in` at that point, since `push()`'s transition hasn't committed yet)
      // instead of the destination, which cancels the pending navigation. The user was left
      // staring at a freshly-reloaded sign-in page after a successful login, with no visible
      // error, and had to click "Sign in" again and again. A hard navigation sidesteps the
      // client router entirely — the browser requests `next` fresh, cookies already set, no
      // race possible — which is exactly what a security-sensitive transition like this
      // should do anyway.
      window.location.assign(next);
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
      {searchParams.get("password") === "changed" ? (
        <p role="status" className="text-mint text-sm">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      <div
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const nextMode =
            event.key === "Home"
              ? "login"
              : event.key === "End"
                ? "register"
                : mode === "login"
                  ? "register"
                  : "login";
          switchMode(nextMode);
          document.getElementById(`sign-in-form-tab-${nextMode}`)?.focus();
        }}
        role="tablist"
        aria-label="Sign in or create account"
        className="border-line bg-surface-2 flex justify-center gap-1 rounded-[var(--radius-pill)] border p-1 text-sm"
      >
        <button
          type="button"
          role="tab"
          id="sign-in-form-tab-login"
          aria-selected={mode === "login"}
          tabIndex={mode === "login" ? 0 : -1}
          aria-controls="sign-in-form-panel"
          onClick={() => switchMode("login")}
          className={
            mode === "login"
              ? "bg-lime-fill text-lime-ink flex-1 rounded-[var(--radius-pill)] px-4 py-1.5 font-medium"
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
          tabIndex={mode === "register" ? 0 : -1}
          aria-controls="sign-in-form-panel"
          onClick={() => switchMode("register")}
          className={
            mode === "register"
              ? "bg-lime-fill text-lime-ink flex-1 rounded-[var(--radius-pill)] px-4 py-1.5 font-medium"
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
          <label htmlFor="auth-password" className="flex flex-col gap-1.5">
            <span className="text-muted">Password</span>
            <PasswordInput
              id="auth-password"
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
          </label>
          {mode === "register" && (
            <span id="sign-in-form-password-hint" className="text-muted text-xs">
              {PASSWORD_REQUIREMENTS_HINT}
              <span className="mt-1 block" aria-live="polite">
                {password.length >= NEW_PASSWORD_MIN_LENGTH
                  ? "Minimum length reached."
                  : `${NEW_PASSWORD_MIN_LENGTH - password.length} more characters needed.`}
              </span>
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
