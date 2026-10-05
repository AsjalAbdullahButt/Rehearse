"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { TrendChart, type TrendSeries } from "@/components/progress/trend-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OptionPill } from "@/components/ui/option-pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import { repeatSetupHref } from "@/lib/interview/repeat-link";
import { roleLabel } from "@/lib/interview/role-label";
import { INTERVIEW_MODE_OPTIONS } from "@/lib/interview/types";
import type { Category, InterviewMode, ProgressRow, SessionStatus } from "@/lib/interview/types";
import { scoreBandFromTen } from "@/lib/score-band";

const DIFFICULTY_TONE = { easy: "mint", medium: "amber", hard: "coral" } as const;
const MODE_TONE: Record<InterviewMode, "lime" | "violet" | "mint" | "amber"> = {
  technical_qa: "lime",
  coding: "violet",
  system_design: "mint",
  case_study: "amber",
};
const STATUS_LABEL: Record<SessionStatus, string> = {
  completed: "Completed",
  in_progress: "In progress",
  ended_early: "Ended early",
};
const STATUS_ORDER: SessionStatus[] = ["completed", "in_progress", "ended_early"];

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

// Charts need a line to draw: one scored interview is a dot, not a trend.
const MIN_SESSIONS_FOR_TRENDS = 2;

function modeName(mode: InterviewMode): string {
  return INTERVIEW_MODE_OPTIONS.find((option) => option.slug === mode)?.name ?? "Technical Q&A";
}

function formatAvg(value: number | null, digits = 0): string {
  return value === null ? "—" : value.toFixed(digits);
}

function percent(scoreOutOfTen: number): string {
  return `${Math.round(scoreOutOfTen * 10)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatSpeakingTime(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.round(seconds / 60);
  return minutes < 1 ? "under 1 min speaking" : `${minutes} min speaking`;
}

export function ProgressView({ sessions: initialSessions }: { sessions: ProgressRow[] }) {
  const handleSessionExpiry = useSessionExpiry();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
        setModeFilter("all");
        setStatusFilter("all");
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
  const modesPresent = useMemo(
    () => INTERVIEW_MODE_OPTIONS.filter((o) => sessions.some((r) => r.interview_mode === o.slug)),
    [sessions],
  );
  const statusesPresent = useMemo(
    () => STATUS_ORDER.filter((status) => sessions.some((row) => row.status === status)),
    [sessions],
  );

  const filtered = useMemo(
    () =>
      sessions.filter(
        (row) =>
          (roleFilter === "all" || row.role === roleFilter) &&
          (modeFilter === "all" || row.interview_mode === modeFilter) &&
          (statusFilter === "all" || row.status === statusFilter),
      ),
    [sessions, roleFilter, modeFilter, statusFilter],
  );

  // Oldest-first for the trend charts, since the API returns most-recent-first for the card
  // list below (a session detail page reads top-to-bottom newest-first; a trend line reads
  // left-to-right chronologically — both orderings are correct for what they're used for).
  const chronological = useMemo(() => [...filtered].reverse(), [filtered]);
  const scored = chronological.filter((row) => row.avg_overall_score !== null);
  const hasTrends = scored.length >= MIN_SESSIONS_FOR_TRENDS;

  const latest = scored[scored.length - 1];
  const previous = scored[scored.length - 2];
  const change =
    latest?.avg_overall_score != null && previous?.avg_overall_score != null
      ? Math.round((latest.avg_overall_score - previous.avg_overall_score) * 10)
      : null;

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
    <div ref={listRef} tabIndex={-1} className="flex flex-col gap-8">
      <p role="status" className="text-muted text-sm">
        {notice}
      </p>
      {deleteError ? (
        <p role="alert" className="text-coral text-sm">
          {deleteError}
        </p>
      ) : null}

      <section aria-labelledby="progress-over-time" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="progress-over-time" className="font-display text-text text-xl font-bold">
            Progress over time
          </h2>
          {hasTrends && latest?.avg_overall_score != null ? (
            <p className="text-muted text-sm">
              Your latest interview scored{" "}
              <span className="text-text font-medium">{percent(latest.avg_overall_score)}</span>
              {change !== null && change !== 0 ? (
                <>
                  , {change > 0 ? "up" : "down"} {Math.abs(change)} points from the one before.
                </>
              ) : change === 0 ? (
                <>, the same as the one before.</>
              ) : (
                "."
              )}
            </p>
          ) : null}
        </div>

        {hasTrends ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <h3 className="text-muted text-xs font-medium tracking-wide uppercase">
                Overall score trend
              </h3>
              <TrendChart series={overallScoreSeries} yMax={10} />
            </Card>

            <Card className="flex flex-col gap-3">
              <h3 className="text-muted text-xs font-medium tracking-wide uppercase">
                Score by category
              </h3>
              <TrendChart series={categoryScoreSeries} yMax={10} />
            </Card>

            <Card className="flex flex-col gap-3">
              <h3 className="text-muted text-xs font-medium tracking-wide uppercase">
                Filler rate trend
              </h3>
              <TrendChart series={fillerRateSeries} yMax={maxFillerRate} yUnit="/100w" />
            </Card>

            <Card className="flex flex-col gap-3">
              <h3 className="text-muted text-xs font-medium tracking-wide uppercase">Pace trend</h3>
              <TrendChart series={paceSeries} yMax={maxWpm} yUnit=" wpm" />
            </Card>
          </div>
        ) : (
          <EmptyState
            title="Trends appear after your second scored interview"
            description="One interview is a starting point, not a trend. Complete another and Rehearse will chart how your scores, pace and filler words change."
            action={
              <Link
                href="/interview"
                className="bg-lime-fill text-lime-ink inline-flex min-h-11 items-center rounded-[var(--radius-pill)] px-6 text-sm font-medium"
              >
                Start another interview
              </Link>
            }
          />
        )}
      </section>

      <section aria-labelledby="interview-history" className="flex flex-col gap-4">
        <h2 id="interview-history" className="font-display text-text text-xl font-bold">
          Interview history
        </h2>

        <div className="flex flex-col gap-3">
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
                  label={roleLabel(role)}
                  selected={roleFilter === role}
                  onSelect={setRoleFilter}
                />
              ))}
            </div>
          ) : null}
          {modesPresent.length > 1 ? (
            <div
              role="radiogroup"
              aria-label="Filter by interview type"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-muted text-xs font-medium tracking-wide uppercase">Type</span>
              <OptionPill
                name="mode-filter"
                value="all"
                label="All types"
                selected={modeFilter === "all"}
                onSelect={setModeFilter}
              />
              {modesPresent.map((option) => (
                <OptionPill
                  name="mode-filter"
                  key={option.slug}
                  value={option.slug}
                  label={option.name}
                  selected={modeFilter === option.slug}
                  onSelect={setModeFilter}
                />
              ))}
            </div>
          ) : null}
          {statusesPresent.length > 1 ? (
            <div
              role="radiogroup"
              aria-label="Filter by status"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-muted text-xs font-medium tracking-wide uppercase">Status</span>
              <OptionPill
                name="status-filter"
                value="all"
                label="Any status"
                selected={statusFilter === "all"}
                onSelect={setStatusFilter}
              />
              {statusesPresent.map((status) => (
                <OptionPill
                  name="status-filter"
                  key={status}
                  value={status}
                  label={STATUS_LABEL[status]}
                  selected={statusFilter === status}
                  onSelect={setStatusFilter}
                />
              ))}
            </div>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted py-8 text-center text-sm">No sessions match this filter.</p>
        ) : null}
        <div className="flex flex-col gap-4">
          {filtered.map((row) => {
            const speaking = formatSpeakingTime(row.total_answer_s);
            const categoriesScored = CATEGORY_ORDER.filter(
              (category) => row.category_scores[category] !== undefined,
            );
            return (
              <Card key={row.session_id} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h3 className="text-text text-base font-semibold">
                      {roleLabel(row.role, row.role_title)} interview
                      {row.company ? (
                        <span className="text-muted font-normal"> · {row.company}</span>
                      ) : null}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={MODE_TONE[row.interview_mode]}>
                        {modeName(row.interview_mode)}
                      </Badge>
                      <Badge tone={DIFFICULTY_TONE[row.difficulty]}>{row.difficulty}</Badge>
                      <Badge>{STATUS_LABEL[row.status]}</Badge>
                    </div>
                  </div>
                  {row.avg_overall_score !== null ? (
                    <div className="flex flex-col items-start gap-1 sm:items-end">
                      <span className="font-display text-text text-3xl font-bold tabular-nums">
                        {percent(row.avg_overall_score)}
                        <span className="text-muted ml-1 text-sm font-normal">overall</span>
                      </span>
                      <ScoreBadge band={scoreBandFromTen(row.avg_overall_score)} />
                    </div>
                  ) : (
                    <span className="text-muted text-sm">Not scored yet</span>
                  )}
                </div>

                {categoriesScored.length > 0 || row.avg_clarity !== null ? (
                  <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {categoriesScored.map((category) => (
                      <div key={category} className="flex flex-col">
                        <dt className="text-muted text-xs">{CATEGORY_LABEL[category]}</dt>
                        <dd className="font-mono-metric text-text tabular-nums">
                          {percent(row.category_scores[category] ?? 0)}
                        </dd>
                      </div>
                    ))}
                    {row.avg_clarity !== null ? (
                      <div className="flex flex-col">
                        <dt className="text-muted text-xs">Communication (clarity)</dt>
                        <dd className="font-mono-metric text-text tabular-nums">
                          {percent(row.avg_clarity)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                <p className="text-muted text-xs">
                  {new Date(row.started_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {" · "}
                  Answers {row.answer_count} of {row.question_count}
                  {speaking ? ` · ${speaking}` : ""}
                  {row.avg_wpm !== null ? ` · ${formatAvg(row.avg_wpm)} wpm` : ""}
                  {row.avg_filler_count !== null
                    ? ` · ${formatAvg(row.avg_filler_count, 1)} fillers per answer`
                    : ""}
                </p>

                <div className="border-line flex flex-wrap items-center justify-end gap-3 border-t pt-3">
                  <Link
                    href={`/session/${encodeURIComponent(row.session_id)}/summary`}
                    className="text-lime inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  >
                    View summary
                  </Link>
                  <Link
                    href={repeatSetupHref(row)}
                    className="text-lime mr-auto inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  >
                    Retry interview
                  </Link>
                  {confirmingId === row.session_id ? (
                    <>
                      <span className="text-muted text-xs">Delete this session&apos;s data?</span>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={deletingId === row.session_id}
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
            );
          })}
        </div>
      </section>
    </div>
  );
}
