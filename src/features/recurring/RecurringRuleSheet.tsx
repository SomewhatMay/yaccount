"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseDollars } from "@/core/money";
import {
  isTransferRule,
  type Category,
  type Container,
  type Frequency,
  type IntervalConfig,
  type RecurringRule,
  type AnnuallyConfig,
  type BiweeklyConfig,
  type CustomConfig,
  type MonthlyConfig,
  type WeeklyConfig,
} from "@/core/model";
import type { RuleFormInput } from "@/features/recurring/RecurringView";
import { defaultSign, type Sign } from "@/features/ledger/amount";
import { SignToggle } from "@/features/ledger/SignToggle";
import { categoryDotColor } from "@/features/category-color";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetFooter } from "@/components/ui/sheet";
import { ResponsiveSheet } from "@/features/ui";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { todayIso } from "@/features/clock";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const UNITS: CustomConfig["unit"][] = ["day", "week", "month", "year"];

export function RecurringRuleSheet({
  open,
  rule,
  categories,
  containers,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  rule: RecurringRule | null;
  categories: Category[];
  containers: Container[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: RuleFormInput, editingId?: string) => Promise<void>;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? "Edit recurring" : "New recurring transaction"}
      description="It generates one pending transaction each time it comes due — you approve every occurrence in the inbox."
    >
      {open && (
        <RuleForm
          key={rule?.id ?? "new"}
          rule={rule}
          categories={categories}
          containers={containers}
          onSubmit={onSubmit}
        />
      )}
    </ResponsiveSheet>
  );
}

function RuleForm({
  rule,
  categories,
  containers,
  onSubmit,
}: {
  rule: RecurringRule | null;
  categories: Category[];
  containers: Container[];
  onSubmit: (input: RuleFormInput, editingId?: string) => Promise<void>;
}) {
  const activeCategories = useMemo(
    () =>
      categories
        .filter((c) => !c.is_archived || c.id === rule?.template_category_id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, rule],
  );
  const activeContainers = useMemo(
    () =>
      containers.filter(
        (c) =>
          !c.is_archived ||
          c.id === rule?.template_container_id ||
          c.id === rule?.template_to_container_id,
      ),
    [containers, rule],
  );

  const editingTransfer = rule ? isTransferRule(rule) : false;
  const [mode, setMode] = useState<"entry" | "transfer">(
    editingTransfer ? "transfer" : "entry",
  );

  const [vendor, setVendor] = useState(rule?.template_vendor_source ?? "");
  const [categoryId, setCategoryId] = useState(
    rule?.template_category_id ?? activeCategories[0]?.id ?? "",
  );
  const [fromId, setFromId] = useState(rule?.template_container_id ?? "general");
  const [toId, setToId] = useState(rule?.template_to_container_id ?? "");
  const [amountStr, setAmountStr] = useState(
    rule?.template_amount != null
      ? (Math.abs(rule.template_amount) / 100).toFixed(2)
      : "",
  );
  const [pickedSign, setPickedSign] = useState<Sign | null>(
    rule?.template_amount != null ? (rule.template_amount >= 0 ? "+" : "-") : null,
  );

  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? "monthly");
  const [cfg, setCfg] = useState<ConfigState>(() => initialConfig(rule));
  const [startDate, setStartDate] = useState(rule?.start_date ?? todayIso());
  const [endDate, setEndDate] = useState(rule?.end_date ?? "");

  const cat = categories.find((c) => c.id === categoryId);
  const sign: Sign = pickedSign ?? defaultSign(cat?.type ?? "expense");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor.trim()) return toast.error("Add a name — what is this transaction?");

    let magnitude: number;
    try {
      magnitude = Math.abs(parseDollars(amountStr));
    } catch {
      return toast.error("Enter a valid amount.");
    }
    if (magnitude === 0) return toast.error("Amount can't be zero.");

    let interval_config: IntervalConfig;
    try {
      interval_config = buildConfig(frequency, cfg);
    } catch (err) {
      return toast.error(
        err instanceof Error ? err.message : "Check the schedule fields.",
      );
    }

    const input: RuleFormInput = {
      frequency,
      interval_config,
      template_vendor_source: vendor.trim(),
      template_container_id: fromId,
      start_date: startDate,
      end_date: endDate || null,
      template_amount:
        mode === "transfer" ? magnitude : sign === "-" ? -magnitude : magnitude,
      template_category_id: mode === "transfer" ? null : categoryId,
      template_to_container_id: mode === "transfer" ? toId : null,
    };

    if (mode === "entry" && !categoryId) return toast.error("Pick a category.");
    if (mode === "transfer") {
      if (!toId || !fromId) return toast.error("Pick both containers.");
      if (toId === fromId) return toast.error("Pick two different containers.");
    }

    try {
      await onSubmit(input, rule?.id);
    } catch {
      toast.error("Couldn't save — check the fields.");
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as "entry" | "transfer")}
          className="bg-muted/50 w-fit rounded-full p-0.5"
        >
          <ToggleGroupItem
            value="entry"
            className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
          >
            Expense / income
          </ToggleGroupItem>
          <ToggleGroupItem
            value="transfer"
            className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
          >
            Transfer
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="grid gap-1.5">
          <Label htmlFor="rr-vendor">
            {mode === "transfer" ? "Note" : "Payee / source"}
          </Label>
          <Input
            id="rr-vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder={mode === "transfer" ? "e.g. Move to savings" : "e.g. Netflix"}
          />
        </div>

        {mode === "entry" ? (
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span
                      className="mr-0.5 size-2 rounded-full"
                      style={{ backgroundColor: categoryDotColor(c.id) }}
                    />
                    {c.name}
                    <span className="text-muted-foreground ml-1">· {c.type}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <Label>{mode === "transfer" ? "From container" : "Container"}</Label>
          <ContainerSelect
            value={fromId}
            onChange={setFromId}
            containers={activeContainers}
          />
        </div>

        {mode === "transfer" && (
          <div className="grid gap-1.5">
            <Label>To container</Label>
            <ContainerSelect
              value={toId}
              onChange={setToId}
              containers={activeContainers.filter((c) => c.id !== fromId)}
              placeholder="To…"
            />
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="rr-amount">Amount</Label>
          <div className="flex items-center gap-1.5">
            {mode === "entry" && (
              <SignToggle
                sign={sign}
                onChange={setPickedSign}
                className="border-input size-9 shrink-0 rounded-lg border"
              />
            )}
            <Input
              id="rr-amount"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="tnum font-mono"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Repeats</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Twice a month</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="annually">Yearly</SelectItem>
              <SelectItem value="custom">Custom…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <FrequencyConfig frequency={frequency} cfg={cfg} setCfg={setCfg} />

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rr-start">Starts</Label>
            <Input
              id="rr-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rr-end">Ends (optional)</Label>
            <Input
              id="rr-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <SheetFooter className="mt-auto">
        <Button type="submit">{rule ? "Save changes" : "Add recurring"}</Button>
      </SheetFooter>
    </form>
  );
}

function ContainerSelect({
  value,
  onChange,
  containers,
  placeholder = "Container",
}: {
  value: string;
  onChange: (v: string) => void;
  containers: Container[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {containers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Frequency config: one small block of inputs per frequency ───────────────

interface ConfigState {
  day_of_week: string;
  day_of_month: string;
  biweekly_a: string;
  biweekly_b: string;
  annual_month: string;
  annual_day: string;
  custom_every: string;
  custom_unit: CustomConfig["unit"];
}

function initialConfig(rule: RecurringRule | null): ConfigState {
  const base: ConfigState = {
    day_of_week: "1",
    day_of_month: "1",
    biweekly_a: "1",
    biweekly_b: "15",
    annual_month: "1",
    annual_day: "1",
    custom_every: "2",
    custom_unit: "week",
  };
  if (!rule) return base;
  switch (rule.frequency) {
    case "weekly":
      return {
        ...base,
        day_of_week: String((rule.interval_config as WeeklyConfig).day_of_week),
      };
    case "monthly":
      return {
        ...base,
        day_of_month: String((rule.interval_config as MonthlyConfig).day_of_month),
      };
    case "biweekly": {
      const [a, b] = (rule.interval_config as BiweeklyConfig).days_of_month;
      return { ...base, biweekly_a: String(a), biweekly_b: String(b) };
    }
    case "annually": {
      const cfg = rule.interval_config as AnnuallyConfig;
      return { ...base, annual_month: String(cfg.month), annual_day: String(cfg.day) };
    }
    case "custom": {
      const cfg = rule.interval_config as CustomConfig;
      return { ...base, custom_every: String(cfg.every), custom_unit: cfg.unit };
    }
    default:
      return base;
  }
}

function buildConfig(frequency: Frequency, s: ConfigState): IntervalConfig {
  const int = (v: string, name: string) => {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new Error(`${name} must be a whole number.`);
    return n;
  };
  switch (frequency) {
    case "daily":
      return {};
    case "weekly":
      return { day_of_week: int(s.day_of_week, "Day of week") };
    case "monthly":
      return { day_of_month: int(s.day_of_month, "Day of month") };
    case "biweekly": {
      const a = int(s.biweekly_a, "First day");
      const b = int(s.biweekly_b, "Second day");
      const [lo, hi] = a < b ? [a, b] : [b, a];
      if (lo === hi) throw new Error("Pick two different days of the month.");
      return { days_of_month: [lo, hi] };
    }
    case "annually":
      return { month: int(s.annual_month, "Month"), day: int(s.annual_day, "Day") };
    case "custom":
      return { every: int(s.custom_every, "Interval"), unit: s.custom_unit };
  }
}

function FrequencyConfig({
  frequency,
  cfg,
  setCfg,
}: {
  frequency: Frequency;
  cfg: ConfigState;
  setCfg: React.Dispatch<React.SetStateAction<ConfigState>>;
}) {
  const set = (k: keyof ConfigState) => (v: string) =>
    setCfg((prev) => ({ ...prev, [k]: v }));

  if (frequency === "daily") return null;

  if (frequency === "weekly") {
    return (
      <div className="grid gap-1.5">
        <Label>On</Label>
        <Select value={cfg.day_of_week} onValueChange={set("day_of_week")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEEKDAYS.map((d, i) => (
              <SelectItem key={d} value={String(i)}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (frequency === "monthly") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor="rr-dom">Day of month</Label>
        <Input
          id="rr-dom"
          type="number"
          min={1}
          max={31}
          value={cfg.day_of_month}
          onChange={(e) => set("day_of_month")(e.target.value)}
          className="tnum font-mono"
        />
        <p className="text-muted-foreground text-xs">
          Months shorter than this fall on their last day.
        </p>
      </div>
    );
  }

  if (frequency === "biweekly") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="rr-bw-a">First day</Label>
          <Input
            id="rr-bw-a"
            type="number"
            min={1}
            max={31}
            value={cfg.biweekly_a}
            onChange={(e) => set("biweekly_a")(e.target.value)}
            className="tnum font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rr-bw-b">Second day</Label>
          <Input
            id="rr-bw-b"
            type="number"
            min={1}
            max={31}
            value={cfg.biweekly_b}
            onChange={(e) => set("biweekly_b")(e.target.value)}
            className="tnum font-mono"
          />
        </div>
      </div>
    );
  }

  if (frequency === "annually") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="rr-mo">Month</Label>
          <Input
            id="rr-mo"
            type="number"
            min={1}
            max={12}
            value={cfg.annual_month}
            onChange={(e) => set("annual_month")(e.target.value)}
            className="tnum font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rr-dy">Day</Label>
          <Input
            id="rr-dy"
            type="number"
            min={1}
            max={31}
            value={cfg.annual_day}
            onChange={(e) => set("annual_day")(e.target.value)}
            className="tnum font-mono"
          />
        </div>
      </div>
    );
  }

  // custom
  return (
    <div className="grid grid-cols-[auto_1fr] items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="rr-every">Every</Label>
        <Input
          id="rr-every"
          type="number"
          min={1}
          value={cfg.custom_every}
          onChange={(e) => set("custom_every")(e.target.value)}
          className="tnum w-24 font-mono"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Unit</Label>
        <Select
          value={cfg.custom_unit}
          onValueChange={(v) =>
            setCfg((p) => ({ ...p, custom_unit: v as CustomConfig["unit"] }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
                {Number(cfg.custom_every) === 1 ? "" : "s"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
