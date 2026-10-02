"use client";

import { Button } from "@/components/ui/button";

export function ExportReportButton({ label = "Export PDF" }: { label?: string }) {
  return (
    <Button variant="secondary" size="sm" className="no-print w-fit" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
