"use client";

import { useState } from "react";
import { toast } from "sonner";
import { recordSnapshot } from "@/core/commands";
import { formatCents, parseDollars } from "@/core/money";
import type { Container } from "@/core/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Log what an investment container is really worth today (§5.6). Market growth is
 * never a transaction — it lives only in these reports, and each one is kept, so
 * the history stays intact.
 */
export function LogBalanceSheet({
  container,
  onOpenChange,
  onSave,
}: {
  container: Container | null;
  onOpenChange: (open: boolean) => void;
  onSave: (op: ReturnType<typeof recordSnapshot>) => Promise<void>;
}) {
  return (
    <Sheet open={container !== null} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">Log reported balance</SheetTitle>
          <SheetDescription>
            What {container?.name ?? "this container"} is actually worth today. Growth
            isn&apos;t a transaction — every report is kept.
          </SheetDescription>
        </SheetHeader>
        {container && (
          <LogBalanceForm key={container.id} container={container} onSave={onSave} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function LogBalanceForm({
  container,
  onSave,
}: {
  container: Container;
  onSave: (op: ReturnType<typeof recordSnapshot>) => Promise<void>;
}) {
  const [date, setDate] = useState(today());
  const [amountStr, setAmountStr] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let reported: number;
    try {
      reported = parseDollars(amountStr);
    } catch {
      return toast.error("Enter a valid amount.");
    }
    await onSave(
      recordSnapshot({ container_id: container.id, date, reported_balance: reported }),
    );
    toast.success("Balance reported", {
      description: `${container.name} · ${formatCents(reported)}`,
    });
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor="snapshot-date">As of</Label>
          <Input
            id="snapshot-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="snapshot-amount">Reported value</Label>
          <Input
            id="snapshot-amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="tnum font-mono"
          />
        </div>
      </div>
      <SheetFooter className="mt-auto">
        <Button type="submit">Save report</Button>
      </SheetFooter>
    </form>
  );
}
