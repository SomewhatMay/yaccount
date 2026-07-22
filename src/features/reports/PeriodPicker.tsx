"use client";

import { GitCompareIcon } from "lucide-react";
import type { PeriodPreset, ReportingPeriod } from "@/core/engine/period";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-6-months", label: "Last 6 months" },
  { value: "last-12-months", label: "Last 12 months" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
];

const today = (): string => new Date().toISOString().slice(0, 10);

/** One period as a preset dropdown; picking "Custom" reveals two date inputs. */
function PeriodField({
  period,
  onChange,
}: {
  period: ReportingPeriod;
  onChange: (p: ReportingPeriod) => void;
}) {
  const selectValue = period.kind === "custom" ? "custom" : period.preset;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "custom") {
            const end = today();
            onChange({ kind: "custom", start: `${end.slice(0, 4)}-01-01`, end });
          } else {
            onChange({ kind: "preset", preset: v as PeriodPreset });
          }
        }}
      >
        <SelectTrigger size="sm" className="min-w-40 rounded-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom…</SelectItem>
        </SelectContent>
      </Select>

      {period.kind === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Start date"
            value={period.start}
            max={period.end}
            onChange={(e) => onChange({ ...period, start: e.target.value })}
            className="h-8 w-auto rounded-lg text-sm"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            aria-label="End date"
            value={period.end}
            min={period.start}
            onChange={(e) => onChange({ ...period, end: e.target.value })}
            className="h-8 w-auto rounded-lg text-sm"
          />
        </div>
      )}
    </div>
  );
}

/**
 * The unified reporting-period control (§6.1) + two-range compare (§6.2). Primary
 * period on the left; a Compare toggle reveals a second field whose ranges every
 * widget then renders side by side.
 */
export function PeriodPicker({
  period,
  onPeriodChange,
  comparePeriod,
  onCompareChange,
}: {
  period: ReportingPeriod;
  onPeriodChange: (p: ReportingPeriod) => void;
  comparePeriod: ReportingPeriod | null;
  onCompareChange: (p: ReportingPeriod | null) => void;
}) {
  const comparing = comparePeriod !== null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <PeriodField period={period} onChange={onPeriodChange} />
      <Button
        type="button"
        variant={comparing ? "secondary" : "ghost"}
        size="sm"
        className={cn("rounded-full", comparing && "text-primary")}
        aria-pressed={comparing}
        onClick={() =>
          onCompareChange(comparing ? null : { kind: "preset", preset: "last-month" })
        }
      >
        <GitCompareIcon className="size-4" />
        Compare
      </Button>
      {comparing && (
        <>
          <span className="text-muted-foreground text-xs">vs</span>
          <PeriodField period={comparePeriod} onChange={(p) => onCompareChange(p)} />
        </>
      )}
    </div>
  );
}
