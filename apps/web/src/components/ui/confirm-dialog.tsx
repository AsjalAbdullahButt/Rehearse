"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";

/** A confirmation for destructive or hard-to-undo actions. Built on the native <dialog> opened
 * with showModal(), which gives a focus trap, Escape-to-close, an inert background and focus
 * restoration to the opener without any extra dependency. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // Escape: let the parent own the state instead of the browser closing it behind our back.
        event.preventDefault();
        if (!pending) onCancel();
      }}
      className="bg-surface text-text border-line m-auto w-[calc(100%-2rem)] max-w-md rounded-[var(--radius-card)] border p-6 shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="font-display text-text text-lg font-bold">
          {title}
        </h2>
        <div id={descriptionId} className="text-muted text-sm">
          {description}
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
