"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { TrendChart, type TrendSeries } from "@/components/progress/trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OptionPill } from "@/components/ui/option-pill";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import { INTERVIEW_MODE_OPTIONS, ROLE_OPTIONS } from "@/lib/interview/types";
import type { Category, InterviewMode, ProgressRow } from "@/lib/interview/types";

const DIFFICULTY_TONE = { easy: "mint", medium: "amber", hard: "coral" } as const;
const MODE_TONE: Record<InterviewMode, "lime" | "violet" | "mint" | "amber"> = {
  technical_qa: "lime",
  coding: "violet",
  system_design: "mint",
  case_study: "amber",
};

// Fixed categorical order/colors, reused everywhere a category needs an identity color (see
// lib/interview/rubric-insights.ts for the same field order) — coral/amber stay reserved for
// status (warning/error) elsewhere in the app, never repurposed as a fourth category color.
const CATEGORY_COLOR: Record<Category, string> = {
  behavioral: "var(--color-lime)",
  technical: "var(--color-violet)",
  situational: "var(--color-mint)",
};
const CATEGORY_LABEL: Record<Category, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  situational: "Situational",
};
const CATEGORY_ORDER: Category[] = ["behavioral", "technical", "situational"];

function roleName(slug: string): string {
  const preset = ROLE_OPTIONS.find((option) => option.slug === slug)?.name;
  if (preset) return preset;
  // A custom role is stored as its slugified title ('devops-engineer').
  return slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function modeName(mode: InterviewMode): string {
  return INTERVIEW_MODE_OPTIONS.find((option) => option.slug === mode)?.name ?? "Technical Q&A";
}

function formatAvg(value: number | null, digits = 0): string {
  return value === null ? "—" : value.toFixed(digits);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ProgressView({ sessions: initialSessions }: { sessions: ProgressRow[] }) {
  const handleSessionExpiry = useSessionExpiry();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sessions, setSessions] = useState(initialSessions);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteSession(sessionId: string) {
    setDeletingId(sessionId);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/interview/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (await handleSessionExpiry(response)) return;
      if (response.ok) {
        setSessions((current) => current.filter((row) => row.session_id !== sessionId));
        setRoleFilter("all");
        setConfirmingId(null);
        setNotice("Session deleted.");
        listRef.current?.focus();
      } else {
        setDeleteError("Could not delete this session. Please try again.");
      }
    } catch {
      setDeleteError(
        "Could not reach the server. Your session has not been removed from this list.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const rolesPresent = useMemo(
    () => Array.from(new Set(sessions.map((row) => row.role))) as string[],
    [sessions],
  );

  const filtered = useMemo(
    () => (roleFilter === "all" ? sessions : sessions.filter((row) => row.role === roleFilter)),
    [sessions, roleFilter],
  );

  // Oldest-first for the trend charts, since the API returns most-recent-first for the card
  // list below (a session detail page reads top-to-bottom newest-first; a trend line reads
  // left-to-right chronologically — both orderings are correct for what they're used for).
  const chronological = useMemo(() => [...filtered].reverse(), [filtered]);

  const overallScoreSeries: TrendSeries[] = [
    {
      key: "overall",
      label: "Overall score",
      color: "var(--color-lime)",
      points: chronological.map((row) => ({
        x: formatDate(row.started_at),
        y: row.avg_overall_score,
      })),
    },
  ];

  const categoriesPresent = CATEGORY_ORDER.filter((category) =>
    chronological.some((row) => row.category_scores[category] !== undefined),
  );
  const categoryScoreSeries: TrendSeries[] = categoriesPresent.map((category) => ({
    key: category,
    label: CATEGORY_LABEL[category],
    color: CATEGORY_COLOR[category],
    points: chronological.map((row) => ({
      x: formatDate(row.started_at),
      y: row.category_scores[category] ?? null,
    })),
  }));

  const fillerRateSeries: TrendSeries[] = [
    {
      key: "filler-rate",
      label: "Filler rate",
      color: "var(--color-amber)",
      points: chronological.map((row) => ({
        x: formatDate(row.started_at),
        y: row.avg_filler_rate_per_100_words,
      })),
    },
  ];

  const paceSeries: TrendSeries[] = [
    {
      key: "pace",
      label: "Pace",
      color: "var(--color-violet)",
      points: chronological.map((row) => ({ x: formatDate(row.started_at), y: row.avg_wpm })),
    },
  ];

  const maxWpm = Math.max(200, ...chronological.map((row) => row.avg_wpm ?? 0));
  const maxFillerRate = Math.max(
    10,
    ...chronological.map((row) => row.avg_filler_rate_per_100_words ?? 0),
  );

  return (
    <div ref={listRef} tabIndex={-1} className="flex flex-col gap-6">
      <p role="status" className="text-muted text-sm">
        {notice}
      </p>
      {deleteError ? (
        <p role="alert" className="text-coral text-sm">
          {deleteError}
        </p>
      ) : null}
      {rolesPresent.length > 1 ? (
        <div
          role="radiogroup"
          aria-label="Filter by role on this page"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-muted text-xs font-medium tracking-wide uppercase">Role</span>
          <OptionPill
            name="role-filter"
            value="all"
            label="All roles"
            selected={roleFilter === "all"}
            onSelect={setRoleFilter}
          />
          {rolesPresent.map((role) => (
            <OptionPill
              name="role-filter"
              key={role}
              value={role}
              label={roleName(role)}
              selected={roleFilter === role}
              onSelect={setRoleFilter}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
            Overall score trend
          </h2>
          <TrendChart series={overallScoreSeries} yMax={10} />
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
            Score by category
          </h2>
          <TrendChart series={categoryScoreSeries} yMax={10} />
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">
            Filler rate trend
          </h2>
          <TrendChart series={fillerRateSeries} yMax={maxFillerRate} yUnit="/100w" />
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-muted text-xs font-medium tracking-wide uppercase">Pace trend</h2>
          <TrendChart series={paceSeries} yMax={maxWpm} yUnit=" wpm" />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {filtered.length === 0 ? (
          <p className="text-muted py-8 text-center text-sm">No sessions match this filter.</p>
        ) : null}
        {filtered.map((row) => (
          <Card key={row.session_id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-text text-sm font-medium">{roleName(row.role)}</span>
                <Badge tone={DIFFICULTY_TONE[row.difficulty]}>{row.difficulty}</Badge>
                <Badge tone={MODE_TONE[row.interview_mode]}>{modeName(row.interview_mode)}</Badge>
              </div>
              <span className="text-muted text-xs">
                {new Date(row.started_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Answers</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {row.answer_count}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Avg WPM</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {formatAvg(row.avg_wpm)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Avg fillers</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {formatAvg(row.avg_filler_count, 1)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Avg clarity</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {formatAvg(row.avg_clarity, 1)}/10
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs tracking-wide uppercase">Avg score</span>
                <span className="font-mono-metric text-text text-lg tabular-nums">
                  {formatAvg(row.avg_overall_score, 1)}/10
                </span>
              </div>
            </div>

            <div className="border-line flex flex-wrap items-center justify-end gap-3 border-t pt-3">
              <Link
                href={`/session/${encodeURIComponent(row.session_id)}/summary`}
                className="text-lime mr-auto inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
              >
                View summary
              </Link>
              {confirmingId === row.session_id ? (
                <>
                  <span className="text-muted text-xs">Delete this session&apos;s data?</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={deletingId === row.session_id}
                    onClick={() => void handleDeleteSession(row.session_id)}
                  >
                    {deletingId === row.session_id ? "Deleting…" : "Confirm delete"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingId !== null}
                    onClick={() => {
                      setDeleteError(null);
                      setConfirmingId(null);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deletingId !== null}
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmingId(row.session_id);
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
