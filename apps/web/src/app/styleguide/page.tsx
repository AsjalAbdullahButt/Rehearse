"use client";

import { useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const COLOR_TOKENS = [
  { name: "ink", label: "Ink" },
  { name: "surface", label: "Surface" },
  { name: "surface-2", label: "Surface 2" },
  { name: "line", label: "Line" },
  { name: "text", label: "Text" },
  { name: "muted", label: "Muted" },
  { name: "lime", label: "Lime" },
  { name: "violet", label: "Violet" },
  { name: "coral", label: "Coral" },
  { name: "amber", label: "Amber" },
  { name: "mint", label: "Mint" },
] as const;

const BADGE_TONES: BadgeTone[] = ["neutral", "lime", "violet", "coral", "amber", "mint"];

export default function StyleguidePage() {
  const [toggled, setToggled] = useState(true);

  return (
    <div className="flex min-h-screen flex-col gap-12 bg-ink px-6 py-12 sm:px-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text">
            Rehearse styleguide
          </h1>
          <p className="mt-1 text-sm text-muted">Design tokens and UI primitives, both themes.</p>
        </div>
        <ThemeToggle />
      </header>

      <section aria-labelledby="colors-heading" className="flex flex-col gap-4">
        <h2 id="colors-heading" className="font-display text-xl font-bold text-text">
          Colors
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {COLOR_TOKENS.map((token) => (
            <div key={token.name} className="flex flex-col gap-2">
              <div
                className="h-16 rounded-[var(--radius-tile)] border border-line"
                style={{ backgroundColor: `var(--${token.name})` }}
              />
              <span className="text-xs text-muted">{token.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="type-heading" className="flex flex-col gap-4">
        <h2 id="type-heading" className="font-display text-xl font-bold text-text">
          Type
        </h2>
        <div className="flex flex-col gap-3">
          <p className="font-display text-5xl font-bold tracking-[-0.035em] text-text">
            Bricolage Grotesque
          </p>
          <p className="text-lg text-text">Geist body text at a comfortable reading size.</p>
          <p className="font-mono-metric text-2xl tabular-nums text-text">01:24 — JetBrains Mono</p>
        </div>
      </section>

      <section aria-labelledby="buttons-heading" className="flex flex-col gap-4">
        <h2 id="buttons-heading" className="font-display text-xl font-bold text-text">
          Buttons
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <section aria-labelledby="badges-heading" className="flex flex-col gap-4">
        <h2 id="badges-heading" className="font-display text-xl font-bold text-text">
          Badges
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
      </section>

      <section aria-labelledby="cards-heading" className="flex flex-col gap-4">
        <h2 id="cards-heading" className="font-display text-xl font-bold text-text">
          Cards &amp; stats
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-muted">Standard card, 28px radius.</p>
          </Card>
          <Card tile>
            <Stat label="Filler words" value={4} unit="count" />
          </Card>
          <Card tile>
            <Stat label="Pace" value={142} unit="wpm" />
          </Card>
        </div>
      </section>

      <section aria-labelledby="controls-heading" className="flex flex-col gap-4">
        <h2 id="controls-heading" className="font-display text-xl font-bold text-text">
          Controls
        </h2>
        <div className="flex items-center gap-6">
          <Toggle pressed={toggled} onPressedChange={setToggled} label="Example toggle" />
          <Tooltip content="This is a tooltip">
            <Button variant="secondary" size="sm">
              Hover me
            </Button>
          </Tooltip>
        </div>
      </section>
    </div>
  );
}
