import { Suspense } from "react";

import { Card } from "@/components/ui/card";

import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="bg-dot-grid bg-ink flex flex-1 flex-col items-center justify-center px-6 py-24">
      <Card className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <span className="bg-lime text-lime-ink flex size-10 items-center justify-center rounded-full">
            <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
              <path
                d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.93V21h2v-2.07A7 7 0 0019 12h-2z"
                fill="currentColor"
              />
            </svg>
          </span>
          <h1 className="font-display text-text text-xl font-bold">Welcome to Rehearse</h1>
          <p className="text-muted text-sm">
            Sign in or create an account to start your mock interview.
          </p>
        </div>
        <Suspense>
          <SignInForm />
        </Suspense>
      </Card>
    </div>
  );
}
