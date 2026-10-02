import { Card } from "@/components/ui/card";

import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="bg-dot-grid bg-ink flex flex-1 flex-col items-center justify-center px-6 py-24">
      <Card className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-display text-text text-xl font-bold">Reset your password</h1>
          <p className="text-muted text-sm">
            Enter your account email and Rehearse will prepare a secure reset link.
          </p>
        </div>
        <ForgotPasswordForm />
      </Card>
    </div>
  );
}
