"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import { allowLeavingPage, confirmLeavingPage } from "@/hooks/use-unsaved-changes";
import { NEW_PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_HINT } from "@/lib/auth/password-policy";

type PasswordStatus = "idle" | "saving" | "saved" | "error";
type DeleteStatus = "idle" | "confirming" | "deleting" | "error";

async function parseErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? "Something went wrong. Please try again.";
}

export function AccountPrivacyPanel() {
  const router = useRouter();
  const handleSessionExpiry = useSessionExpiry();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<PasswordStatus>("idle");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleChangePassword() {
    if (!confirmLeavingPage()) return;
    setPasswordStatus("saving");
    setPasswordError(null);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (await handleSessionExpiry(response)) return;
      if (!response.ok) {
        setPasswordError(await parseErrorMessage(response));
        setPasswordStatus("error");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus("saved");
      allowLeavingPage();
      router.push("/sign-in?password=changed");
    } catch {
      setPasswordError("Couldn't reach the server. Try again.");
      setPasswordStatus("error");
    }
  }

  async function handleDeleteAccount() {
    if (!confirmLeavingPage()) return;
    setDeleteStatus("deleting");
    setDeleteError(null);
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: deletePassword }),
      });
      if (await handleSessionExpiry(response)) return;
      if (!response.ok) {
        setDeleteError(await parseErrorMessage(response));
        setDeleteStatus("confirming");
        return;
      }
      allowLeavingPage();
      router.push("/");
    } catch {
      setDeleteError("Couldn't reach the server. Try again.");
      setDeleteStatus("confirming");
    }
  }

  return (
    <Card className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-text text-xl font-bold">Privacy &amp; data</h2>
        <ul className="text-muted flex flex-col gap-1 text-sm">
          <li>
            • Your raw audio recording is never stored — it exists only in memory during
            transcription.
          </li>
          <li>
            • Each recording is sent to Groq (our transcription provider) to produce a text
            transcript, which is what gets saved.
          </li>
          <li>
            • That transcript, along with any job description or background you provide, is sent to
            Groq&apos;s AI model to generate your feedback.
          </li>
          <li>
            • If you upload a resume to pre-fill your background, it&apos;s read once to extract
            text, sent to Groq to summarize, and then discarded — the file itself is never stored.
          </li>
          <li>
            • Deleting your account permanently removes your transcripts, feedback, and session
            history — this cannot be undone.
          </li>
        </ul>
      </div>

      <div className="border-line flex flex-col gap-3 border-t pt-6">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          Change password
        </span>
        <label htmlFor="current-password" className="text-muted text-sm">
          Current password
        </label>
        <PasswordInput
          id="current-password"
          placeholder="Current password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <label htmlFor="new-password" className="text-muted text-sm">
          New password
        </label>
        <PasswordInput
          id="new-password"
          placeholder="New password"
          autoComplete="new-password"
          minLength={NEW_PASSWORD_MIN_LENGTH}
          aria-describedby="account-privacy-password-hint"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <span id="account-privacy-password-hint" className="text-muted -mt-1 text-xs">
          {PASSWORD_REQUIREMENTS_HINT}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="h-auto min-h-11 w-fit py-2"
            disabled={
              passwordStatus === "saving" ||
              !currentPassword ||
              newPassword.length < NEW_PASSWORD_MIN_LENGTH
            }
            onClick={() => void handleChangePassword()}
          >
            {passwordStatus === "saving" ? "Updating…" : "Update password"}
          </Button>
          {passwordStatus === "saved" ? (
            <span className="text-mint text-sm">
              Updated — you&apos;ll need to sign in again on this device too.
            </span>
          ) : null}
          {passwordStatus === "error" && passwordError ? (
            <span role="alert" className="text-coral text-sm">
              {passwordError}
            </span>
          ) : null}
        </div>
      </div>

      <div className="border-coral/30 flex flex-col gap-3 border-t pt-6">
        <span className="text-coral text-xs font-medium tracking-wide uppercase">Danger zone</span>
        {deleteStatus === "idle" ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-auto min-h-11 w-fit py-2"
            onClick={() => setDeleteStatus("confirming")}
          >
            Delete account
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-text text-sm">
              This permanently deletes your account and all of your interview data. Enter your
              password to confirm.
            </p>
            <label htmlFor="delete-password" className="text-muted text-sm">
              Confirm your password
            </label>
            <PasswordInput
              id="delete-password"
              placeholder="Confirm your password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                className="h-auto min-h-11 w-fit py-2"
                disabled={deleteStatus === "deleting" || !deletePassword}
                onClick={() => void handleDeleteAccount()}
              >
                {deleteStatus === "deleting" ? "Deleting…" : "Permanently delete my account"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteStatus("idle");
                  setDeletePassword("");
                  setDeleteError(null);
                }}
              >
                Cancel
              </Button>
            </div>
            {deleteError ? (
              <span role="alert" className="text-coral text-sm">
                {deleteError}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
