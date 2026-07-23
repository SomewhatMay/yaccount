"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Container } from "@/core/model";
import { nameTaken } from "@/features/unique-name";
import { ResponsiveSheet } from "@/features/ui";
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
export function ContainerSheet({
  open,
  siblings,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  siblings: Container[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; is_investment: boolean }) => Promise<void>;
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
  onSubmit: (input: { name: string; is_investment: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [investment, setInvestment] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name the container.");
    if (nameTaken(siblings, trimmed)) {
      return toast.error("You already have a container with that name.");
    }
    await onSubmit({ name: trimmed, is_investment: investment });
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

        <p className="text-muted-foreground text-xs">
          A new container stays out of your overall balance until you say otherwise — you
          can count it from its ⋯ menu any time.
        </p>
      </div>

      <SheetFooter className="mt-auto">
        <Button type="submit">Create container</Button>
      </SheetFooter>
    </form>
  );
}
