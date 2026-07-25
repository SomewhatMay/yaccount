"use client";

import { useState } from "react";
import type { Container } from "@/core/model";
import { nameTaken } from "@/features/unique-name";
import { ResponsiveSheet } from "@/features/ui";
import { InlineError } from "@/features/ui/InlineError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetFooter } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Creating a container (§12.4 M11: creating opens a sheet).
 *
 * This replaced an inline compose bar. Renaming stays inline (§12.4-a), and the
 * per-container switches — counted, investment, default wallet — stay in the
 * row's `⋯` menu, because they are edits to something that already exists.
 */
export interface ContainerFormInput {
  name: string;
  is_investment: boolean;
  include_in_overall_balance: boolean;
}

export function ContainerSheet({
  open,
  siblings,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  siblings: Container[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: ContainerFormInput) => Promise<void>;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="New container"
      description="Where your money lives — a bank account, a savings pot, a brokerage."
    >
      {/* Mounted only while open, so each visit starts empty. */}
      {open && <ContainerForm siblings={siblings} onSubmit={onSubmit} />}
    </ResponsiveSheet>
  );
}

function ContainerForm({
  siblings,
  onSubmit,
}: {
  siblings: Container[];
  onSubmit: (input: ContainerFormInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [investment, setInvestment] = useState(false);
  // "Not counted" to start: §5.7's overall balance is opt-in and stays opt-in.
  // What changed is that the choice is now ON the form — "why isn't my money in
  // the headline" was a surprise you met later, at the far end of a ⋯ menu.
  const [counted, setCounted] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    setError("");
    if (!trimmed) return setError("Name the container.");
    if (nameTaken(siblings, trimmed)) {
      return setError("You already have a container with that name.");
    }
    try {
      await onSubmit({
        name: trimmed,
        is_investment: investment,
        include_in_overall_balance: counted,
      });
    } catch {
      setError("Couldn't create the container. Try again.");
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ct-name">Name</Label>
          <Input
            id="ct-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vacation"
            autoFocus
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "ct-name-error" : undefined}
          />
          {error && <InlineError id="ct-name-error">{error}</InlineError>}
        </div>

        <div className="grid gap-1.5">
          <Label>Kind</Label>
          <ToggleGroup
            type="single"
            value={investment ? "investment" : "plain"}
            onValueChange={(v) => v && setInvestment(v === "investment")}
            className="bg-muted/50 w-fit rounded-full p-0.5"
          >
            <ToggleGroupItem
              value="plain"
              className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
            >
              Wallet
            </ToggleGroupItem>
            <ToggleGroupItem
              value="investment"
              className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
            >
              Investment
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">
            {investment
              ? "You can report its real-world value over time, and see the gain against what you put in."
              : "Its balance is exactly what you have moved in and out."}
          </p>
        </div>

        {/* The same shape as every other field on this sheet and on the category
            one: label, a segmented pair, one line saying what the choice means.
            A checkbox with its sentence beside it was the odd control out, and
            on a phone that sentence wrapped around it. */}
        <div className="grid gap-1.5">
          <Label>Overall balance</Label>
          <ToggleGroup
            type="single"
            value={counted ? "counted" : "uncounted"}
            onValueChange={(v) => v && setCounted(v === "counted")}
            className="bg-muted/50 w-fit rounded-full p-0.5"
          >
            <ToggleGroupItem
              value="uncounted"
              className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
            >
              Not counted
            </ToggleGroupItem>
            <ToggleGroupItem
              value="counted"
              className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
            >
              Counted
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">
            {counted
              ? "Its balance adds to the figure at the top of your ledger."
              : "Money here stays out of the figure at the top of your ledger — which is what you want for savings you have already set aside."}
          </p>
        </div>
      </div>

      <SheetFooter className="mt-auto">
        <Button type="submit">Create container</Button>
      </SheetFooter>
    </form>
  );
}
