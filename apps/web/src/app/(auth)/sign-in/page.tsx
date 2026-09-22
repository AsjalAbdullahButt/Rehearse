import Link from "next/link";

import { Card } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <div className="bg-dot-grid bg-ink flex flex-1 flex-col items-center justify-center px-6 py-24">
      <Card className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="bg-lime text-lime-ink flex size-10 items-center justify-center rounded-full">
          <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
            <path
              d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.93V21h2v-2.07A7 7 0 0019 12h-2z"
              fill="currentColor"
            />
          </svg>
        </span>
        <h1 className="font-display text-text text-xl font-bold">Sign-in is on its way</h1>
        <p className="text-muted text-sm">
          Account sign-in and the full mock interview flow launch soon. In the meantime, take a look
          at how Rehearse works.
        </p>
        <Link
          href="/#how-it-works"
          className="bg-lime text-lime-ink inline-flex h-10 items-center justify-center rounded-[var(--radius-pill)] px-5 text-sm font-medium transition-[filter] duration-150 ease-[var(--ease-brand)] hover:brightness-110"
        >
          See how it works
        </Link>
      </Card>
    </div>
  );
}
