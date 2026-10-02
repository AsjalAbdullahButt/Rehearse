"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

function absoluteShareUrl(relativeUrl: string | null): string {
  if (!relativeUrl || typeof window === "undefined") return "";
  return new URL(relativeUrl, window.location.origin).toString();
}

function formatDate(value: string | null): string {
  if (!value) return "No expiration";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function ShareReportControl({
  answerId,
  initialShares,
}: {
  answerId: string;
  initialShares: ReportShare[];
}) {
  const [shares, setShares] = useState(initialShares);
  const [latestUrl, setLatestUrl] = useState("");
  const [audience, setAudience] = useState<ReportShareAudience>("mentor");
  const [expiration, setExpiration] = useState<(typeof EXPIRATIONS)[number]["value"]>("14");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeShares = useMemo(() => shares.filter((share) => share.is_active), [shares]);

  function createShare() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/reports/${encodeURIComponent(answerId)}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          expires_in_days: expiration === "none" ? null : Number(expiration),
        }),
      });
      if (!response.ok) {
        setMessage("Could not create a share link. Please try again.");
        return;
      }
      const created = (await response.json()) as ReportShare;
      const url = absoluteShareUrl(created.url);
      setShares((current) => [created, ...current]);
      setLatestUrl(url);
      setMessage("Share link created. Anyone with this link can view a read-only report.");
    });
  }

  function revokeShare(shareId: string) {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/reports/shares/${encodeURIComponent(shareId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setMessage("Could not revoke that link. Please try again.");
        return;
      }
      setShares((current) =>
        current.map((share) =>
          share.id === shareId
            ? { ...share, is_active: false, revoked_at: new Date().toISOString() }
            : share,
        ),
      );
      setMessage("Share link revoked.");
    });
  }

  async function copyLatest() {
    if (!latestUrl) return;
    await navigator.clipboard.writeText(latestUrl);
    setMessage("Copied.");
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-text text-base font-semibold">Share this report</h2>
        <p className="text-muted mt-1 text-sm">
          Create a read-only link for a mentor, recruiter, or professor. You can revoke it anytime.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Audience</span>
          <select
            value={audience}
            onChange={(event) => setAudience(event.target.value as ReportShareAudience)}
            className="border-line bg-surface-2 text-text focus-visible:outline-lime h-11 rounded-[var(--radius-tile)] border px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {AUDIENCES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Expiration</span>
          <select
            value={expiration}
            onChange={(event) =>
              setExpiration(event.target.value as (typeof EXPIRATIONS)[number]["value"])
            }
            className="border-line bg-surface-2 text-text focus-visible:outline-lime h-11 rounded-[var(--radius-tile)] border px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {EXPIRATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button className="self-end" onClick={createShare} disabled={isPending}>
          Generate link
        </Button>
      </div>

      {latestUrl ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={latestUrl} aria-label="Generated share link" />
          <Button variant="secondary" onClick={copyLatest}>
            Copy
          </Button>
        </div>
      ) : null}

      {message ? (
        <p className="text-muted text-sm" aria-live="polite">
          {message}
        </p>
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
                <Button variant="ghost" size="sm" onClick={() => revokeShare(share.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
