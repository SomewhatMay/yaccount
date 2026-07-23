"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Container } from "@/core/model";
import { nameTaken } from "@/features/unique-name";
import { ResponsiveSheet } from "@/features/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  // Unchecked to start: §5.7's overall balance is opt-in and stays opt-in. What
  // changed is that the choice is now ON the form — "why isn't my money in the
  // headline" was a surprise you met later, at the far end of a ⋯ menu.
  const [counted, setCounted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name the container.");
    if (nameTaken(siblings, trimmed)) {
      return toast.error("You already have a container with that name.");
    }
    await onSubmit({
      name: trimmed,
      is_investment: investment,
      include_in_overall_balance: counted,
    });
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
          />
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

        <div className="grid gap-1.5">
          <Label>Overall balance</Label>
          {/* Checkbox and Label are SIBLINGS tied by id — Radix renders a
              <button>, and a label wrapped around its own control leaves "did
              that click toggle once or twice" to the browser. */}
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="ct-counted"
              checked={counted}
              onCheckedChange={(v) => setCounted(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="ct-counted" className="cursor-pointer font-normal">
              Count this in my overall balance
            </Label>
          </div>
          <p className="text-muted-foreground text-xs">
            {counted
              ? "Its balance adds to the figure at the top of your ledger."
              : "Money in here won't show in the figure at the top of your ledger — which is what you want for savings you've already set aside. You can change this any time."}
          </p>
        </div>
      </div>

      <SheetFooter className="mt-auto">
        <Button type="submit">Create container</Button>
      </SheetFooter>
    </form>
  );
}
