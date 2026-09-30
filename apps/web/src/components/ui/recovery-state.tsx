"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function RecoveryState({
  title,
  description,
  retry = false,
}: {
  title: string;
  description: string;
  retry?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <h1 className="font-display text-text text-xl font-bold">{title}</h1>
        <p className="text-muted text-sm">{description}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {retry ? (
            <Button disabled={pending} onClick={() => startTransition(() => router.refresh())}>
              {pending ? "Trying again…" : "Try again"}
            </Button>
          ) : null}
          <Link
            href="/progress"
            className="text-lime inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4"
          >
            View progress
          </Link>
          <Link
            href="/interview"
            className="text-lime inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4"
          >
            Start an interview
          </Link>
        </div>
      </Card>
    </div>
  );
}
