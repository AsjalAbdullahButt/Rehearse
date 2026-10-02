import { Card } from "@/components/ui/card";

import { ResetPasswordForm } from "./reset-password-form";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = (Array.isArray(params.token) ? params.token[0] : params.token) ?? "";

  return (
    <div className="bg-dot-grid bg-ink flex flex-1 flex-col items-center justify-center px-6 py-24">
      <Card className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-display text-text text-xl font-bold">Choose a new password</h1>
          <p className="text-muted text-sm">
            Use a fresh password you do not use on another service.
          </p>
        </div>
        <ResetPasswordForm token={token} />
      </Card>
    </div>
  );
}
