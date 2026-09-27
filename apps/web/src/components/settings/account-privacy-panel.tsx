"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSessionExpiry } from "@/hooks/use-session-expiry";

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
    } catch {
      setPasswordError("Couldn't reach the server. Try again.");
      setPasswordStatus("error");
    }
  }

  async function handleDeleteAccount() {
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
            • Deleting your account permanently removes your transcripts, feedback, and session
            history — this cannot be undone.
          </li>
        </ul>
      </div>

      <div className="border-line flex flex-col gap-3 border-t pt-6">
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          Change password
        </span>
        <Input
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <Input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            disabled={passwordStatus === "saving" || !currentPassword || newPassword.length < 8}
            onClick={() => void handleChangePassword()}
          >
            {passwordStatus === "saving" ? "Updating…" : "Update password"}
          </Button>
          {passwordStatus === "saved" ? (
            <span className="text-mint text-sm">
              Updated — you&apos;ll need to sign in again on other devices.
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
            className="w-fit"
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
            <Input
              type="password"
              placeholder="Confirm your password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
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
