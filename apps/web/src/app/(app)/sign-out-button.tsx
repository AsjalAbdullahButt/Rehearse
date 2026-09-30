"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { allowLeavingPage, confirmLeavingPage } from "@/hooks/use-unsaved-changes";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (!confirmLeavingPage()) return;
    setIsSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    allowLeavingPage();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}
