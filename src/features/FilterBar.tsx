"use client";

import { useId } from "react";
import { ArrowUpDownIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The filter rail (§12.4 responsive density): a search box, a row of facet
 * chips, and the sort control — set INTO the page on `--surface-sunken`, the
 * plane §12.2 names for exactly this. Below `sm` it scrolls sideways rather than
 * wrapping into a block that pushes the register off the screen.
 *
 * Deliberately generic. Every list view gets filters in M11, and each one asks
 * different questions of its rows — so this owns the rail, the chip, the count
 * and Clear, and the caller owns which facets exist. A screen composes it; it
 * does not fork it.
 *
 * What is NOT here: persistence. A filter left on from yesterday is a hidden
 * reason your list looks wrong, so filters die with the visit (the sort
 * preference, which never hides anything, is persisted by the caller).
 */

export interface FacetOption {
  value: string;
  label: string;
  /** A category swatch, where the option has one (§12.2's one scheme). */
  dot?: string;
}

export interface Facet {
  id: string;
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

export interface RangeField {
  label: string;
  /** Rendered inside the chip's popover — two bounds, either optional. */
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  type: "date" | "amount";
  active: boolean;
}

export interface SortControl<T extends string = string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function FilterBar<T extends string>({
  search,
  onSearch,
  searchPlaceholder = "Search",
  facets = [],
  ranges = [],
  sort,
  activeCount,
  onClear,
  className,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  facets?: Facet[];
  ranges?: RangeField[];
  sort?: SortControl<T>;
  /** Facets currently narrowing the list — what the reader is owed when the
   *  list is shorter than they expect. */
  activeCount: number;
  onClear: () => void;
  className?: string;
}) {
  return (
    <div className={cn("bg-surface-sunken space-y-2 rounded-2xl border p-2", className)}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="bg-background/60 h-9 rounded-full border-0 pl-9 shadow-none"
          />
        </div>
        {sort && <SortSelect sort={sort} />}
      </div>

      {/* The chips scroll sideways on a phone: a rail that wraps to three lines
          is a filter panel, and a filter panel is not what a thumb wants. */}
      <div className="-mx-2 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-2 pb-0.5 [&::-webkit-scrollbar]:hidden">
        {facets.map((facet) => (
          <FacetChip key={facet.id} facet={facet} />
        ))}
        {ranges.map((range) => (
          <RangeChip key={range.label} range={range} />
        ))}
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-muted-foreground h-8 shrink-0 rounded-full px-2.5 text-xs"
          >
            <XIcon className="size-3.5" />
            Clear {activeCount}
          </Button>
        )}
      </div>
    </div>
  );
}

function SortSelect<T extends string>({ sort }: { sort: SortControl<T> }) {
  return (
    <Select value={sort.value} onValueChange={(v) => sort.onChange(v as T)}>
      <SelectTrigger
        aria-label="Sort order"
        className="bg-background/60 w-auto shrink-0 gap-1.5 rounded-full border-0 px-3 shadow-none"
      >
        <ArrowUpDownIcon className="text-muted-foreground size-3.5" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {sort.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A chip reads as chosen through the brand colour, not a filled plate — §12.2
 *  spends iris on the few things that are genuinely active. */
function chipClass(active: boolean): string {
  return cn(
    "h-8 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors duration-[var(--dur-1)] ease-[var(--ease-register)]",
    active
      ? "border-primary/60 text-primary bg-background"
      : "bg-background/60 text-muted-foreground hover:text-foreground border-transparent",
  );
}

function FacetChip({ facet }: { facet: Facet }) {
  // Checkbox and Label are SIBLINGS tied by id, not a label wrapped around the
  // control: Radix renders a <button>, and a label containing its own control
  // leaves "did this click toggle once or twice" to the browser.
  const uid = useId();
  const active = facet.selected.length > 0;
  const toggle = (value: string) =>
    facet.onChange(
      facet.selected.includes(value)
        ? facet.selected.filter((v) => v !== value)
        : [...facet.selected, value],
    );

  return (
    <Popover>
      <PopoverTrigger className={chipClass(active)}>
        {facet.label}
        {active && <span className="tnum ml-1 font-mono">{facet.selected.length}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 gap-0 overflow-y-auto p-1.5">
        {facet.options.length === 0 && (
          <p className="text-muted-foreground px-2 py-2 text-xs">Nothing to filter by.</p>
        )}
        {facet.options.map((o) => {
          const id = `${uid}-${o.value}`;
          return (
            <div key={o.value} className="hover:bg-accent relative flex rounded-lg">
              {/* The LABEL is the whole row — full width, full height — and the
                  checkbox sits on top of it. Anything else leaves dead pixels
                  inside the hover highlight: the row looks pressable right to
                  its edges, so it has to be pressable right to its edges. */}
              <Checkbox
                id={id}
                checked={facet.selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
                className="absolute top-1/2 left-2 -translate-y-1/2"
              />
              <Label
                htmlFor={id}
                className="w-full cursor-pointer overflow-hidden py-2 pr-2 pl-8 font-normal"
              >
                {o.dot && (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: o.dot }}
                    aria-hidden
                  />
                )}
                <span className="truncate">{o.label}</span>
              </Label>
            </div>
          );
        })}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => facet.onChange([])}
            className="text-muted-foreground mt-1 h-7 w-full justify-start rounded-lg px-2 text-xs"
          >
            Clear {facet.label.toLowerCase()}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RangeChip({ range }: { range: RangeField }) {
  const date = range.type === "date";
  return (
    <Popover>
      <PopoverTrigger className={chipClass(range.active)}>{range.label}</PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="grid grid-cols-2 gap-2">
          <Field
            label={date ? "From" : "At least"}
            value={range.from}
            type={date ? "date" : "amount"}
            onChange={(from) => range.onChange({ from, to: range.to })}
          />
          <Field
            label={date ? "To" : "At most"}
            value={range.to}
            type={date ? "date" : "amount"}
            onChange={(to) => range.onChange({ from: range.from, to })}
          />
        </div>
        {range.active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => range.onChange({ from: "", to: "" })}
            className="text-muted-foreground h-7 justify-start rounded-lg px-2 text-xs"
          >
            Clear {range.label.toLowerCase()}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Field({
  label,
  value,
  type,
  onChange,
}: {
  label: string;
  value: string;
  type: "date" | "amount";
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-xs">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type === "date" ? "date" : "text"}
        inputMode={type === "date" ? undefined : "decimal"}
        placeholder={type === "date" ? undefined : "0.00"}
        // `Input` ships `text-base md:text-sm`; a size class only displaces the
        // base one, so the responsive variant has to be restated or the field
        // shrinks on a desktop.
        className="tnum h-8 text-sm md:text-sm"
      />
    </label>
  );
}
