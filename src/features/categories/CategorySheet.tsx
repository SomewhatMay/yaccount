"use client";

import { useState } from "react";
import type { Category, CategoryType } from "@/core/model";
import { nameTaken } from "@/features/unique-name";
import { ResponsiveSheet } from "@/features/ui";
import { InlineError } from "@/features/ui/InlineError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetFooter } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Creating a category (§12.4 M11: creating opens a sheet).
 *
 * This replaced an inline compose bar. Renaming is still inline (§12.4-a) —
 * that is a single-field edit on a row you are looking at, and it stays where
 * the row is.
 */
export function CategorySheet({
  open,
  siblings,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** Everything the new name must not collide with (§ unique-name). */
  siblings: Category[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; type: CategoryType }) => Promise<void>;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="New category"
      description="What your money does. Every entry you log is filed under one."
    >
      {/* Mounted only while open, so each visit starts empty. */}
      {open && <CategoryForm siblings={siblings} onSubmit={onSubmit} />}
    </ResponsiveSheet>
  );
}

function CategoryForm({
  siblings,
  onSubmit,
}: {
  siblings: Category[];
  onSubmit: (input: { name: string; type: CategoryType }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    setError("");
    if (!trimmed) return setError("Name the category.");
    if (nameTaken(siblings, trimmed)) {
      return setError("You already have a category with that name.");
    }
    try {
      await onSubmit({ name: trimmed, type });
    } catch {
      setError("Couldn't create the category. Try again.");
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor="c-name">Name</Label>
          <Input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Groceries"
            autoFocus
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "c-name-error" : undefined}
          />
          {error && <InlineError id="c-name-error">{error}</InlineError>}
        </div>

        <div className="grid gap-1.5">
          <Label>Direction</Label>
          <ToggleGroup
            type="single"
            value={type}
            onValueChange={(v) => v && setType(v as CategoryType)}
            className="bg-muted/50 w-fit rounded-full p-0.5"
          >
            <ToggleGroupItem
              value="expense"
              className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
            >
              Expense
            </ToggleGroupItem>
            <ToggleGroupItem
              value="income"
              className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
            >
              Income
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">
            {type === "income"
              ? "Amounts filed here default to money coming in."
              : "Amounts filed here default to money going out — a refund is one tap away."}
          </p>
        </div>
      </div>

      <SheetFooter className="mt-auto">
        <Button type="submit">Create category</Button>
      </SheetFooter>
    </form>
  );
}
