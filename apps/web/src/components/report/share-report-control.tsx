"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { ReportShare, ReportShareAudience } from "@/lib/interview/types";

const AUDIENCES: { value: ReportShareAudience; label: string }[] = [
  { value: "mentor", label: "Mentor" },
  { value: "recruiter", label: "Recruiter" },
  { value: "professor", label: "Professor" },
];

const EXPIRATIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "none", label: "No expiration" },
] as const;

const SELECT_CLASS =
  "border-line bg-surface-2 text-text focus-visible:outline-lime h-11 rounded-[var(--radius-tile)] border px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

function absoluteShareUrl(relativeUrl: string | null): string {
  if (!relativeUrl || typeof window === "undefined") return "";
  return new URL(relativeUrl, window.location.origin).toString();
}

function formatDate(value: string | null): string {
  if (!value) return "No expiration";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

/** A "Share" button that opens a panel (native <dialog>: focus trap, Escape, focus restore) for
 * creating and revoking read-only links. Revoking asks first, since it breaks a link someone may
 * already be using. */
export function ShareReportControl({
  answerId,
  initialShares,
}: {
  answerId: string;
  initialShares: ReportShare[];
}) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState(initialShares);
  const [latestUrl, setLatestUrl] = useState("");
  const [audience, setAudience] = useState<ReportShareAudience>("mentor");
  const [expiration, setExpiration] = useState<(typeof EXPIRATIONS)[number]["value"]>("14");
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeShares = useMemo(() => shares.filter((share) => share.is_active), [shares]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function createShare() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/reports/${encodeURIComponent(answerId)}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audience,
            expires_in_days: expiration === "none" ? null : Number(expiration),
          }),
        });
        if (!response.ok) {
          toast.push("We couldn’t create a share link. Please try again.", "error");
          return;
        }
        const created = (await response.json()) as ReportShare;
        setShares((current) => [created, ...current]);
        setLatestUrl(absoluteShareUrl(created.url));
      } catch {
        toast.push("Connection lost. We couldn’t create a share link.", "error");
      }
    });
  }

  function revokeShare(shareId: string) {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/reports/shares/${encodeURIComponent(shareId)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          toast.push("We couldn’t revoke that link. Please try again.", "error");
          return;
        }
        setShares((current) =>
          current.map((share) =>
            share.id === shareId
              ? { ...share, is_active: false, revoked_at: new Date().toISOString() }
              : share,
          ),
        );
        setLatestUrl("");
        toast.push("Share link revoked.", "success");
      } catch {
        toast.push("Connection lost. We couldn’t revoke that link.", "error");
      } finally {
        setRevokeId(null);
      }
    });
  }

  async function copyLatest() {
    try {
      await navigator.clipboard.writeText(latestUrl);
      toast.push("Report link copied.", "success");
    } catch {
      toast.push("Couldn’t copy automatically — select the link and copy it.", "warning");
    }
  }

  const latest = shares.find(
    (share) => share.is_active && absoluteShareUrl(share.url) === latestUrl,
  );

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="no-print w-fit"
        onClick={() => setOpen(true)}
      >
        Share report
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="share-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          if (revokeId === null) setOpen(false);
        }}
        onClose={() => setOpen(false)}
        className="bg-surface text-text border-line no-print m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-[var(--radius-card)] border p-6 shadow-2xl backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-5">
          <div>
            <h2 id="share-dialog-title" className="font-display text-text text-lg font-bold">
              Share this report
            </h2>
            <p className="text-muted mt-1 text-sm">
              Creates a read-only link. Anyone with the link can view it until it expires or you
              revoke it.
            </p>
          </div>

          <div className="bg-surface-2 text-muted rounded-[var(--radius-tile)] px-4 py-3 text-xs">
            <p className="text-text mb-1 font-medium">What the link includes</p>
            The question, your scores and rubric, strengths and improvements, and a few short quotes
            from your answer. It does not include your full transcript, audio, email or account
            details.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text font-medium">Who is it for?</span>
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value as ReportShareAudience)}
                className={SELECT_CLASS}
              >
                {AUDIENCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text font-medium">Expires after</span>
              <select
                value={expiration}
                onChange={(event) =>
                  setExpiration(event.target.value as (typeof EXPIRATIONS)[number]["value"])
                }
                className={SELECT_CLASS}
              >
                {EXPIRATIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Button
            loading={isPending && revokeId === null}
            disabled={isPending}
            onClick={createShare}
          >
            {isPending && revokeId === null ? "Generating link…" : "Generate secure link"}
          </Button>

          {latestUrl ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={latestUrl} aria-label="Generated share link" />
                <Button variant="secondary" onClick={() => void copyLatest()}>
                  Copy link
                </Button>
              </div>
              <p className="text-muted text-xs">
                Expires: {latest ? formatDate(latest.expires_at) : "see below"}
              </p>
            </div>
          ) : null}

          {activeShares.length > 0 ? (
            <div className="border-line border-t pt-4">
              <h3 className="text-muted mb-3 text-xs font-medium tracking-wide uppercase">
                Active links
              </h3>
              <ul className="flex flex-col gap-2">
                {activeShares.map((share) => (
                  <li
                    key={share.id}
                    className="border-line flex flex-col gap-2 rounded-[var(--radius-tile)] border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-muted text-sm">
                      {AUDIENCES.find((item) => item.value === share.audience)?.label ?? "Share"}{" "}
                      &middot; expires {formatDate(share.expires_at)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setRevokeId(share.id)}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </dialog>

      <ConfirmDialog
        open={revokeId !== null}
        title="Revoke this link?"
        description="Anyone using it will lose access immediately. You can generate a new link later."
        confirmLabel="Revoke link"
        danger
        pending={isPending}
        onCancel={() => setRevokeId(null)}
        onConfirm={() => {
          if (revokeId) revokeShare(revokeId);
        }}
      />
    </>
  );
}
