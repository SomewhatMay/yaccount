"use client";

import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Inline rename with an explicit confirm/cancel pair (§12.4 — editing in place
 * for a single field, never a mode-swap of the compose bar). Enter and Escape do
 * the same two things. Clicking a button must not commit-on-blur first, so the
 * buttons suppress the input's blur; leaving the field simply keeps it open.
 */
export function RenameField({
  value,
  onSave,
  onCancel,
  label,
  validate,
  className,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  onCancel: () => void;
  label: string;
  /** Return an error message to block the save (e.g. a duplicate name). */
  validate?: (next: string) => string | null;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const trimmed = draft.trim();
  const error = trimmed.length > 0 ? (validate?.(trimmed) ?? null) : null;
  const valid = trimmed.length > 0 && error === null;

  async function commit() {
    if (trimmed.length === 0) return onCancel();
    if (error) return;
    await onSave(trimmed);
  }

  return (
    <div className={cn("relative flex items-center gap-1", className)}>
      {error && (
        <p className="text-destructive absolute -bottom-4 left-1 text-xs">{error}</p>
      )}
      <Input
        autoFocus
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") onCancel();
        }}
        className="h-8"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Save name"
        disabled={!valid}
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        className="text-muted-foreground hover:text-primary size-8 shrink-0 rounded-lg"
      >
        <CheckIcon className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Cancel rename"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className="text-muted-foreground size-8 shrink-0 rounded-lg"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
