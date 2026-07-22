"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookmarkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import {
  categoriesAtom,
  containersAtom,
  defaultContainerIdAtom,
  dispatchAtom,
  flashedRowAtom,
  readyAtom,
  transactionsAtom,
  type FlashedRow,
} from "@/features/store";
import {
  createTemplate,
  removeTemplate,
  unvoidTransaction,
  voidTransaction,
} from "@/core/commands";
import {
  isLiveLedgerRow,
  isTransfer,
  overallBalance,
  overallBalanceSeries,
} from "@/core/engine/balances";
import {
  activeFilterCount,
  applyFilter,
  isFilterActive,
  type TransactionFilter,
  type TransactionKind,
} from "@/core/engine/filter";
import { activeRows, isRegisterSort, sortRegister } from "@/core/engine/ledger";
import { trailingDays } from "@/core/engine/period";
import {
  formatEnteredTime,
  lastMonthIso,
  thisMonthIso,
  todayIso,
  yesterdayIso,
} from "@/features/clock";
import { formatCents, parseDollars } from "@/core/money";
import type { Transaction } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import { useLocalPref } from "@/features/prefs";
import {
  EmptyState,
  Eyebrow,
  Figure,
  FigureSkeleton,
  ListSkeleton,
  Marginalia,
  Money,
} from "@/features/ui";
import { FilterBar } from "@/features/FilterBar";
import { ComposeBar } from "@/features/ledger/ComposeBar";
import { EditTransactionSheet } from "@/features/ledger/EditTransactionSheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDay(iso: string): string {
  if (iso === todayIso()) return "Today";
  if (iso === yesterdayIso()) return "Yesterday";
  return dayFormat.format(new Date(iso + "T00:00:00"));
}

/** Show the clock time only where a burst of entries actually happens — it is
 * what separates three rows logged this afternoon; on older days it is noise. */
function showsTime(iso: string): boolean {
  return iso === todayIso() || iso === yesterdayIso();
}

/** How far back the hero figure's ground reaches. A quarter is long enough to
 * show a shape and short enough that this month still moves it. */
const CURVE_DAYS = 90;

/** Device-local, because how you like to READ your ledger is not a fact about
 * your money (§8.4 — the synced ledgers carry the ledger, nothing else). */
const SORT_KEY = "yaccount.ledger.sort";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "largest", label: "Largest" },
  { value: "smallest", label: "Smallest" },
] as const;

const KINDS: { value: TransactionKind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

/** What the user has typed into the rail. Held as strings so a half-typed bound
 *  simply doesn't constrain yet, rather than erroring under their fingers. */
interface FilterDraft {
  text: string;
  categoryIds: string[];
  containerIds: string[];
  kinds: TransactionKind[];
  dates: { from: string; to: string };
  amounts: { from: string; to: string };
}

const NO_FILTER: FilterDraft = {
  text: "",
  categoryIds: [],
  containerIds: [],
  kinds: [],
  dates: { from: "", to: "" },
  amounts: { from: "", to: "" },
};

/** A typed amount as a magnitude, or no constraint. `parseDollars` throws on a
 * partial value ("1.", "$") — mid-keystroke that is not an error, it is just not
 * a bound yet. */
function boundCents(input: string): number | null {
  if (input.trim() === "") return null;
  try {
    return Math.abs(parseDollars(input));
  } catch {
    return null;
  }
}

function toFilter(draft: FilterDraft): TransactionFilter {
  return {
    text: draft.text,
    categoryIds: draft.categoryIds,
    containerIds: draft.containerIds,
    kinds: draft.kinds,
    range: { start: draft.dates.from || null, end: draft.dates.to || null },
    minAmount: boundCents(draft.amounts.from),
    maxAmount: boundCents(draft.amounts.to),
  };
}

export function LedgerView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const transactions = useAtomValue(transactionsAtom);
  const defaultContainerId = useAtomValue(defaultContainerIdAtom);
  const flashed = useAtomValue(flashedRowAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // Sort is remembered; the filters are deliberately not (§12.4 M11 — a filter
  // still on from yesterday is a hidden reason the list looks wrong).
  const [sort, setSort] = useLocalPref(SORT_KEY, "newest", isRegisterSort);
  const [draft, setDraft] = useState<FilterDraft>(NO_FILTER);
  const filter = useMemo(() => toFilter(draft), [draft]);
  const filtering = isFilterActive(filter);

  // Stable for the session's render; `core` stays clock-free (§ engine).
  const today = useMemo(() => todayIso(), []);

  // The headline is Current Overall Balance (§5.7): only containers the user
  // opted in are counted, so money saved toward something never inflates it.
  // It never responds to the filters — it is a fact about your money, not about
  // the list on screen. That is exactly why the CARRIED figure has to hide when
  // the register is filtered: those rows no longer explain it.
  const balance = useMemo(
    () => overallBalance(transactions, containers),
    [transactions, containers],
  );

  const counted = useMemo(
    () => containers.filter((c) => c.include_in_overall_balance),
    [containers],
  );

  // The ground the figure stands on (§12.7 signature #1): the trailing quarter of
  // this same balance. A balance is the end of a story, and this is the story.
  const curve = useMemo(
    () => overallBalanceSeries(transactions, containers, trailingDays(today, CURVE_DAYS)),
    [transactions, containers, today],
  );

  // This-month in/out across the counted containers, and the same for last month
  // so the figure can be told what it can't say about itself. Transfers are
  // excluded — moving your own money between containers is neither income nor
  // expense.
  const { monthIn, monthOut, lastMonthNet, hadLastMonth } = useMemo(() => {
    const ym = thisMonthIso();
    const prev = lastMonthIso();
    const ids = new Set(counted.map((c) => c.id));
    let inSum = 0;
    let outSum = 0;
    let prevNet = 0;
    let prevRows = 0;
    for (const t of transactions) {
      if (!isLiveLedgerRow(t) || isTransfer(t)) continue;
      if (!ids.has(t.container_id)) continue;
      if (t.yearMonth === ym) {
        if (t.amount >= 0) inSum += t.amount;
        else outSum += -t.amount;
      } else if (t.yearMonth === prev) {
        prevNet += t.amount;
        prevRows += 1;
      }
    }
    return {
      monthIn: inSum,
      monthOut: outSum,
      lastMonthNet: prevNet,
      hadLastMonth: prevRows > 0,
    };
  }, [transactions, counted]);

  const nameOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "Transfer");
  }, [categories]);

  // Show which wallet a row moved through only once there is more than one.
  const containerNameOf = useMemo(() => {
    const m = new Map(containers.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "");
  }, [containers]);
  const showContainer = containers.filter((c) => !c.is_archived).length > 1;
  const uncounted = containers.filter(
    (c) => !c.is_archived && !c.include_in_overall_balance,
  ).length;

  // What else a row can be found by. The engine keeps no lookup tables, so the
  // view that has the names hands them over (§ filter.ts) — typing a category or
  // a wallet name into the search box finds the rows filed under it.
  const labelOf = useMemo(
    () => (t: Transaction) =>
      `${nameOf(t.category_id)} ${containerNameOf(t.container_id)} ${containerNameOf(t.to_container_id)}`,
    [nameOf, containerNameOf],
  );

  // Deleting appends a reversing row and undoing appends one that reverses THAT,
  // so what is live is a chain walk (§0.3) — `activeRows` owns the rule. What is
  // shown is then the shared predicate (`applyFilter`), so the rail, the ⌘K
  // palette and every M11 list view narrow rows by one rule.
  const live = useMemo(() => activeRows(transactions), [transactions]);
  const rows = useMemo(
    () => sortRegister(applyFilter(live, filter, { label: labelOf }), sort),
    [live, filter, labelOf, sort],
  );

  // A size sort ranks entries ACROSS days, so day headers would be lying about
  // what orders the page — the date moves onto the row instead.
  const grouped = sort === "newest" || sort === "oldest";

  const groups = useMemo(() => {
    if (!grouped) return [];
    const out: { day: string; items: Transaction[] }[] = [];
    for (const t of rows) {
      const last = out[out.length - 1];
      if (last && last.day === t.date) last.items.push(t);
      else out.push({ day: t.date, items: [t] });
    }
    return out;
  }, [rows, grouped]);

  // The carried balance, one ordered pass over the days on screen rather than a
  // full scan per header. Computed from the WHOLE ledger, not the filtered rows —
  // it is the running overall balance, which is why it hides when filtered.
  const carried = useMemo(() => {
    if (!grouped || filtering) return null;
    const days = groups.map((g) => g.day);
    const values = overallBalanceSeries(transactions, containers, days);
    return new Map(days.map((d, i) => [d, values[i]]));
  }, [grouped, filtering, groups, transactions, containers]);

  // Save a row as a 1-tap shortcut (§5.8). The template keeps the shape (transfer
  // vs. expense/income) so quick-logging it later reproduces the same kind of row.
  async function saveShortcut(t: Transaction) {
    const transfer = t.to_container_id !== null;
    const id = crypto.randomUUID();
    const input = {
      id,
      template_name: t.vendor_source,
      amount: transfer ? Math.abs(t.amount) : t.amount,
      vendor_source: t.vendor_source,
      container_id: t.container_id,
      category_id: transfer ? null : t.category_id,
      to_container_id: transfer ? t.to_container_id : null,
    };
    await dispatch(createTemplate(input));
    toast.success("Saved as shortcut", {
      description: t.vendor_source,
      action: { label: "Undo", onClick: () => void dispatch(removeTemplate(id)) },
    });
  }

  async function del(t: Transaction) {
    const op = voidTransaction(t);
    await dispatch(op);
    if (editing?.id === t.id) setEditing(null);
    const voidRow = op.type === "transaction.void" ? op.payload.row : null;
    toast.success("Deleted", {
      description: `${t.vendor_source} · ${formatCents(t.amount)}`,
      action: voidRow
        ? {
            label: "Undo",
            onClick: () => {
              // Undo is an op too: a row reversing the reversal, so the ledger
              // records the delete AND the undo rather than erasing either.
              void dispatch(unvoidTransaction(voidRow)).then(() =>
                toast.success("Restored", { description: t.vendor_source }),
              );
            },
          }
        : undefined,
    });
  }

  if (!ready)
    return (
      <div className="space-y-6">
        <FigureSkeleton />
        <div className="bg-card overflow-hidden rounded-2xl border">
          <ListSkeleton />
        </div>
      </div>
    );

  const monthNet = monthIn - monthOut;
  const versusLastMonth = monthNet - lastMonthNet;

  return (
    <div className="space-y-6">
      <Figure
        label="Overall balance"
        cents={balance}
        series={live.length > 0 ? curve : undefined}
      >
        <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-foreground/70 font-medium">This month</span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowDownLeftIcon className="text-positive size-4" />
            <Money cents={monthIn} className="text-foreground" />
            in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpRightIcon className="size-4" />
            <Money cents={monthOut} className="text-foreground" />
            out
          </span>
        </div>
        {/* The accountant's note: what the figure cannot say about itself
            (§12.3). Only once there is a month to compare against. */}
        {hadLastMonth && (
          <Marginalia className="mt-2">
            {versusLastMonth === 0
              ? "level with last month"
              : `${versusLastMonth > 0 ? "up" : "down"} ${formatCents(Math.abs(versusLastMonth))} on last month`}
          </Marginalia>
        )}
        {uncounted > 0 && (
          <Marginalia className="mt-1">
            {uncounted} container{uncounted === 1 ? "" : "s"} not counted
          </Marginalia>
        )}
      </Figure>

      {/* Shortcuts moved into the quick-add sheet (M11): they belong where you
          are about to write, not on the screen you read. */}
      <ComposeBar
        categories={categories}
        containers={containers}
        defaultContainerId={defaultContainerId}
      />

      {live.length > 0 && (
        <FilterBar
          search={draft.text}
          onSearch={(text) => setDraft((d) => ({ ...d, text }))}
          searchPlaceholder="Search entries"
          facets={[
            {
              id: "category",
              label: "Category",
              selected: draft.categoryIds,
              onChange: (categoryIds) => setDraft((d) => ({ ...d, categoryIds })),
              options: categories
                .filter((c) => !c.is_archived)
                .map((c) => ({
                  value: c.id,
                  label: c.name,
                  dot: categoryDotColor(c.id),
                })),
            },
            {
              id: "container",
              label: "Wallet",
              selected: draft.containerIds,
              onChange: (containerIds) => setDraft((d) => ({ ...d, containerIds })),
              options: containers
                .filter((c) => !c.is_archived)
                .map((c) => ({ value: c.id, label: c.name })),
            },
            {
              id: "kind",
              label: "Type",
              selected: draft.kinds,
              onChange: (kinds) =>
                setDraft((d) => ({ ...d, kinds: kinds as TransactionKind[] })),
              options: KINDS,
            },
          ]}
          ranges={[
            {
              label: "Date",
              type: "date",
              from: draft.dates.from,
              to: draft.dates.to,
              active: Boolean(draft.dates.from || draft.dates.to),
              onChange: (dates) => setDraft((d) => ({ ...d, dates })),
            },
            {
              label: "Amount",
              type: "amount",
              from: draft.amounts.from,
              to: draft.amounts.to,
              active: Boolean(draft.amounts.from || draft.amounts.to),
              onChange: (amounts) => setDraft((d) => ({ ...d, amounts })),
            },
          ]}
          sort={{ value: sort, options: [...SORT_OPTIONS], onChange: setSort }}
          activeCount={activeFilterCount(filter)}
          onClear={() => setDraft(NO_FILTER)}
        />
      )}

      {/* `overflow-clip`, NOT `overflow-hidden`: hidden establishes a scroll
          container, which would make the sticky day header stick to this card
          (it never scrolls) instead of to the viewport. Clip rounds the corners
          without creating one. */}
      <div className="bg-card overflow-clip rounded-2xl border">
        {rows.length === 0 ? (
          // Filtering the last row away is still "nothing logged yet", not a
          // filter you can widen.
          filtering && live.length > 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setDraft(NO_FILTER)}
                >
                  Clear filters
                </Button>
              }
            >
              {live.length} entr{live.length === 1 ? "y is" : "ies are"} in the register —
              widen the filters to see them.
            </EmptyState>
          ) : (
            <EmptyState title="Nothing logged yet">
              Every entry you add lands here, newest first. Start with what you spent
              today.
            </EmptyState>
          )
        ) : grouped ? (
          groups.map((g, gi) => (
            <div key={g.day} className={cn(gi > 0 && "border-t")}>
              <DayHeader day={g.day} carried={carried?.get(g.day) ?? null} />
              {g.items.map((t) => (
                <LedgerRow
                  key={t.id}
                  tx={t}
                  flashed={flashed?.id === t.id ? flashed : null}
                  when={showsTime(g.day) ? formatEnteredTime(t.entered_at) : null}
                  categoryName={nameOf(t.category_id)}
                  containerName={showContainer ? containerNameOf(t.container_id) : ""}
                  toContainerName={containerNameOf(t.to_container_id)}
                  onEdit={() => setEditing(t)}
                  onDelete={() => del(t)}
                  onSaveShortcut={() => saveShortcut(t)}
                />
              ))}
            </div>
          ))
        ) : (
          // Ranked by size, across days — so each row carries its own date, and
          // there is no day header to carry a running balance or to separate one
          // run of rows from the next. A quiet divider does that work instead.
          <div className="divide-y">
            {rows.map((t) => (
              <LedgerRow
                key={t.id}
                tx={t}
                flashed={flashed?.id === t.id ? flashed : null}
                when={formatDay(t.date)}
                categoryName={nameOf(t.category_id)}
                containerName={showContainer ? containerNameOf(t.container_id) : ""}
                toContainerName={containerNameOf(t.to_container_id)}
                onEdit={() => setEditing(t)}
                onDelete={() => del(t)}
                onSaveShortcut={() => saveShortcut(t)}
              />
            ))}
          </div>
        )}
      </div>

      <EditTransactionSheet
        editing={editing}
        categories={categories}
        containers={containers}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={async (op) => {
          await dispatch(op);
          setEditing(null);
        }}
        onDelete={del}
      />
    </div>
  );
}

/**
 * The day header, carrying the balance down the page (§12.4 M11) — the paper
 * check register's one structural borrowing. Sticky under the top bar, so the day
 * you are reading and the balance you had reached stay named while you scroll.
 *
 * `carried` is null when a filter is on: the rows below no longer add up to the
 * number, and a balance you cannot reconcile against what you are looking at is
 * worse than no balance. The leaders go with it — with a single child the dot
 * rail would push the label off to the right.
 */
function DayHeader({ day, carried }: { day: string; carried: number | null }) {
  return (
    <div className="bg-surface-sunken sticky top-14 z-10 border-b px-5 py-2">
      <div className={cn(carried !== null && "leaders")}>
        <Eyebrow as="h2" className="text-[0.625rem]">
          {formatDay(day)}
        </Eyebrow>
        {carried !== null && (
          <Money
            cents={carried}
            tone={carried < 0 ? "alert" : "quiet"}
            className="text-xs"
          />
        )}
      </div>
    </div>
  );
}

function LedgerRow({
  tx,
  flashed,
  when,
  categoryName,
  containerName,
  toContainerName,
  onEdit,
  onDelete,
  onSaveShortcut,
}: {
  tx: Transaction;
  /** Set while this row is the one being pointed at (§12.5). */
  flashed: FlashedRow | null;
  /** The last thing on the row's sub-line: the clock time inside a day
   *  group, the date when the register is ranked by size instead. */
  when: string | null;
  categoryName: string;
  containerName: string;
  toContainerName: string;
  onEdit: () => void;
  onDelete: () => void;
  onSaveShortcut: () => void;
}) {
  const transfer = isTransfer(tx);
  const row = useRef<HTMLDivElement>(null);
  const bringIntoView = flashed?.scroll ?? false;

  // Only a row found through the ⌘K palette scrolls: a row you just logged is
  // already at the top of the register, and yanking the page to centre it would
  // be motion in place of an answer. `scroll-behavior` is zeroed globally under
  // `prefers-reduced-motion` (§12.5), so this obeys that with no special case.
  useEffect(() => {
    if (bringIntoView)
      row.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [bringIntoView]);
  // Money in is emerald; a transfer is your own money moving, so it stays quiet.
  const income = !transfer && tx.amount >= 0;
  const sub = [
    transfer
      ? [containerName || "Transfer", toContainerName].filter(Boolean).join(" → ")
      : [categoryName, containerName].filter(Boolean).join(" · "),
    when,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={row}
      className={cn(
        "group flex items-center gap-3 px-5 py-3 transition-colors ease-[var(--ease-register)]",
        // The end of §12.5's one orchestrated moment: the row lands carrying a
        // single iris wash, which then settles. Everywhere else on this row,
        // motion is a colour under the pointer — including the press state, which
        // stays a colour rather than a transform: the motion budget has three
        // durations and no scale in it.
        flashed
          ? "bg-primary/15 duration-[var(--dur-2)]"
          : "hover:bg-muted/40 active:bg-muted/60 duration-[var(--dur-1)]",
      )}
    >
      {transfer ? (
        <ArrowRightIcon className="text-muted-foreground size-2.5 shrink-0" aria-hidden />
      ) : (
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: tx.category_id
              ? categoryDotColor(tx.category_id)
              : undefined,
          }}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{tx.vendor_source}</div>
        <div className="text-muted-foreground truncate text-xs">{sub}</div>
      </div>
      <Money
        cents={tx.amount}
        absolute={transfer}
        tone={transfer ? "quiet" : income ? "in" : "neutral"}
        className="text-sm tracking-tight"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label="Transaction actions"
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSaveShortcut}>
            <BookmarkIcon className="size-4" />
            Save as shortcut
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
