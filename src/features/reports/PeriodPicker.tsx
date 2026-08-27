"use client";

import { CheckIcon, GitCompareIcon } from "lucide-react";
import {
  PERIOD_PRESETS,
  type PeriodPreset,
  type ReportingPeriod,
} from "@/core/engine/period";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chipClass } from "@/features/FilterBar";
import { todayIso } from "@/features/clock";

/** One label per preset, exhaustively — adding a preset to the engine's list
 *  without naming it here is a type error rather than a blank menu row. */
export const PRESET_LABEL: Record<PeriodPreset, string> = {
  "last-month": "Last month",
  "last-3-months": "Last 3 months",
  "last-6-months": "Last 6 months",
  "last-12-months": "Last 12 months",
  ytd: "Year to date",
  all: "All time",
};

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** What the chip says it is showing. A custom window names its own dates —
 *  "Custom" alone would make the reader open the menu to find out. */
export function periodLabel(period: ReportingPeriod): string {
  if (period.kind === "preset") return PRESET_LABEL[period.preset];
  const f = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00`));
  return `${f(period.start)} – ${f(period.end)}`;
}

export function periodPickerLabel(
  period: ReportingPeriod,
  comparePeriod: ReportingPeriod | null,
): string {
  return comparePeriod
    ? `${periodLabel(period)} vs ${periodLabel(comparePeriod)}`
    : periodLabel(period);
}

function PeriodOptions({
  period,
  onChange,
  label,
}: {
  period: ReportingPeriod;
  onChange: (period: ReportingPeriod) => void;
  label: string;
}) {
  const custom = period.kind === "custom";
  return (
    <div role="group" aria-label={label}>
      <div className="grid gap-0.5">
        {PERIOD_PRESETS.map((preset) => {
          const active = period.kind === "preset" && period.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange({ kind: "preset", preset })}
              className="hover:bg-accent flex w-full items-center gap-2 rounded-lg py-2 pr-2 pl-2 text-left text-sm"
            >
              <CheckIcon
                className={cn("size-3.5 shrink-0", !active && "invisible")}
                aria-hidden
              />
              {PRESET_LABEL[preset]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const end = todayIso();
            onChange({ kind: "custom", start: `${end.slice(0, 4)}-01-01`, end });
          }}
          className="hover:bg-accent flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm"
        >
          <CheckIcon
            className={cn("size-3.5 shrink-0", !custom && "invisible")}
            aria-hidden
          />
          Custom…
        </button>

        {custom && (
          <div className="mt-1 grid grid-cols-2 gap-2 border-t pt-2">
            <label className="block">
              <span className="text-muted-foreground mb-1 block text-xs">From</span>
              <Input
                type="date"
                aria-label="Start date"
                value={period.start}
                max={period.end}
                onChange={(e) => onChange({ ...period, start: e.target.value })}
                // `Input` ships `text-base md:text-sm`; a size class displaces
                // only the base one, so the variant has to be restated.
                className="tnum h-8 text-sm md:text-sm"
              />
            </label>
            <label className="block">
              <span className="text-muted-foreground mb-1 block text-xs">To</span>
              <Input
                type="date"
                aria-label="End date"
                value={period.end}
                min={period.start}
                onChange={(e) => onChange({ ...period, end: e.target.value })}
                className="tnum h-8 text-sm md:text-sm"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const label = periodPickerLabel(period, comparePeriod);
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Reporting period: ${label}`}
        className={cn(chipClass(true), "max-w-36 truncate sm:max-w-52")}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(32rem,calc(100dvh-2rem))] w-72 overflow-y-auto p-1.5"
      >
        <p className="text-muted-foreground px-2 py-1 text-xs font-semibold tracking-[0.12em] uppercase">
          Period
        </p>
        <PeriodOptions period={period} onChange={onPeriodChange} label="Period" />
        <div className="mt-1 border-t pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={comparing}
            className={cn("w-full justify-start", comparing && "text-primary")}
            onClick={() =>
              onCompareChange(comparing ? null : { kind: "preset", preset: "last-month" })
            }
          >
            <GitCompareIcon className="size-4" />
            Compare periods
          </Button>
        </div>
        {comparePeriod && (
          <div className="mt-1 border-t pt-1">
            <p className="text-muted-foreground px-2 py-1 text-xs font-semibold tracking-[0.12em] uppercase">
              Compare with
            </p>
            <PeriodOptions
              label="Compared period"
              period={comparePeriod}
              onChange={onCompareChange}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
