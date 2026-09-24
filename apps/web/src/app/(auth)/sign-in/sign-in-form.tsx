"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "register";

interface AuthErrorBody {
  error?: { code?: string; message?: string };
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/interview";

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

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="border-line bg-surface-2 flex justify-center gap-1 rounded-[var(--radius-pill)] border p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("login")}
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
          onClick={() => setMode("register")}
          className={
            mode === "register"
              ? "bg-lime text-lime-ink flex-1 rounded-[var(--radius-pill)] px-4 py-1.5 font-medium"
              : "text-muted flex-1 rounded-[var(--radius-pill)] px-4 py-1.5"
          }
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

        <label className="flex flex-col gap-1.5 text-left text-sm">
          <span className="text-muted">Password</span>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "sign-in-form-error" : undefined}
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
