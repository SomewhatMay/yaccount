"use client";

import { useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A confirmation that cannot be given by reflex.
 *
 * §12.4's rule stands — confirm-destructive is an `AlertDialog` — but the app's
 * ordinary two-button confirm is calibrated for acts that have an Undo waiting
 * in the toast. Replacing or standing down an entire account has no toast-sized
 * inverse, so this asks the user to *type* a word first: the action stays
 * disabled until it matches. One deliberate keystroke sequence is the difference
 * between a decision and a mis-tap on a phone.
 *
 * Everything else about it is the house pattern: nullable-subject control from
 * the caller, a description that says what is NOT lost, a verb-phrase cancel,
 * and the destructive verb as the action label.
 */
export function ConfirmDestructive({
  open,
  onOpenChange,
  title,
  phrase,
  confirmLabel,
  cancelLabel = "Keep it",
  disabled = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The word the user must type. Matched trimmed and case-insensitively — this
   * is a speed bump against reflex, not a spelling test. */
  phrase: string;
  confirmLabel: string;
  cancelLabel?: string;
  disabled?: boolean;
  onConfirm: () => void;
  /** What will happen, in the user's terms. Shown above the phrase field. */
  children: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const fieldId = useId();
  const hintId = useId();
  const matches = typed.trim().toLowerCase() === phrase.toLowerCase();
  const ready = matches && !disabled;

  // Cleared on every open AND close, so a dialog reopened after a change of mind
  // never starts already-armed.
  function handleOpenChange(next: boolean): void {
    setTyped("");
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-1.5 py-2">
          <Label htmlFor={fieldId}>
            Type <span className="font-mono font-medium">{phrase}</span> to continue
          </Label>
          <Input
            id={fieldId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) {
                e.preventDefault();
                handleOpenChange(false);
                onConfirm();
              }
            }}
            aria-describedby={hintId}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <p id={hintId} className="text-muted-foreground text-xs">
            This one cannot be undone from a toast, so it asks for the word first.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={!ready} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
