"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookmarkIcon,
  PencilIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import {
  categoriesAtom,
  containersAtom,
  containerFactsAtom,
  dispatchAtom,
  flashRowAtom,
  flashedRowAtom,
  ledgerCountAtom,
  ledgerLocalAddAtom,
  ledgerRemoteChangeAtom,
  ledgerRevisionAtom,
  readLedgerEntriesById,
  readLedgerFocus,
  readLedgerPage,
  readOverallBalanceSeries,
  readPeriodCashFlow,
  readyAtom,
  scanLedgerEntries,
  usageFactsAtom,
  type FlashedRow,
} from "@/features/store";
import { createTemplate, unvoidTransaction, voidTransaction } from "@/core/commands";
import { isTransfer } from "@/core/engine/balances";
import {
  activeFilterCount,
  applyFilter,
  isFilterActive,
  type TransactionKind,
} from "@/core/engine/filter";
import { NO_FILTER, toFilter, type FilterDraft } from "@/features/filter-draft";
import { parseLedgerQuery } from "@/features/ledger/deep-link";
import { isRegisterSort, sortRegister } from "@/core/engine/ledger";
import {
  rankCategoriesByUsage,
  rankContainersByUsage,
} from "@/core/engine/usage-ranking";
import { trailingDays } from "@/core/engine/period";
import {
  formatEnteredTime,
  lastMonthIso,
  thisMonthIso,
  todayIso,
  yesterdayIso,
} from "@/features/clock";
import { formatCents } from "@/core/money";
import type { Transaction } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryColor, categoryColorFor } from "@/features/category-color";
import { CategoryGlyph } from "@/features/category-icons";
import { useLocalPref } from "@/features/prefs";
import {
  EmptyState,
  Eyebrow,
  Figure,
  FigureSkeleton,
  ListSkeleton,
  Marginalia,
  Money,
  PageHeaderSkeleton,
  RowActions,
  useFlashRow,
} from "@/features/ui";
import { FilterBar } from "@/features/FilterBar";
import { EditTransactionSheet } from "@/features/ledger/EditTransactionSheet";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  initialLedgerPagingState,
  createLedgerSessionCache,
  ledgerPagingReducer,
  pageSizeForWidth,
  type LedgerPagingState,
} from "@/features/ledger/paging-state";

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
const SCREEN_TITLE_CLASS =
  "font-display text-xl font-semibold tracking-tight sm:mt-1.5 sm:text-2xl";

/** Device-local, because how you like to READ your ledger is not a fact about
 * your money (§8.4 — the synced ledgers carry the ledger, nothing else). */
const SORT_KEY = "yaccount.ledger.sort";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "largest", label: "Largest" },
  { value: "smallest", label: "Smallest" },
] as const;

const SCAN_CANDIDATES = 100;
const yieldToBrowser = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 0));

const KINDS: { value: TransactionKind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

let savedPaging: LedgerPagingState | null = null;
let savedPagingQuery = "";
let savedFilter: FilterDraft | null = null;
const ledgerSession = createLedgerSessionCache<FilterDraft>();

export function LedgerView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const containerFacts = useAtomValue(containerFactsAtom);
  const usageFacts = useAtomValue(usageFactsAtom);
  const ledgerCount = useAtomValue(ledgerCountAtom);
  const revision = useAtomValue(ledgerRevisionAtom);
  const localAdd = useAtomValue(ledgerLocalAddAtom);
  const remoteChange = useAtomValue(ledgerRemoteChangeAtom);
  const flashed = useAtomValue(flashedRowAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const flashRow = useSetAtom(flashRowAtom);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [initialQuery] = useState(() => parseLedgerQuery(searchParams.toString()));
  const focusId = useRef(initialQuery.focus);

  // Sort is remembered; the filters are deliberately not (§12.4 M11 — a filter
  // still on from yesterday is a hidden reason the list looks wrong). The one
  // exception is arriving from a dashboard drill-down: the `/ledger?…` link seeds
  // the rail once, on mount, and then the URL is cleared so it behaves like any
  // hand-typed filter — clearable, and gone on the next visit.
  //
  // The seed reads `useSearchParams`, NOT `window.location`: during a client
  // navigation the address bar updates a beat after this first renders, so
  // reading the window here seeded an empty filter while the URL visibly carried
  // one. The hook is synced to the router and correct on that first render.
  const [sort, setSort] = useLocalPref(SORT_KEY, "newest", isRegisterSort);
  const [draft, setDraft] = useState<FilterDraft>(
    () =>
      searchParams.toString()
        ? initialQuery.draft
        : (savedFilter ?? initialQuery.draft),
  );
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
    () =>
      containers.reduce(
        (total, container) =>
          !container.include_in_overall_balance || container.is_archived
            ? total
            : total + (containerFacts.get(container.id)?.balance ?? 0),
        0,
      ),
    [containerFacts, containers],
  );

  const counted = useMemo(
    () => containers.filter((c) => c.include_in_overall_balance),
    [containers],
  );

  const summaryKey = useMemo(
    () => JSON.stringify([revision, today, counted.map((container) => container.id)]),
    [counted, revision, today],
  );
  const [summary, setSummary] = useState<{
    key: string;
    curve: number[];
    monthIn: number;
    monthOut: number;
    lastMonthNet: number;
    hadLastMonth: boolean;
  } | null>(null);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const ids = counted.map((container) => container.id);
    void Promise.all([
      readOverallBalanceSeries(ids, trailingDays(today, CURVE_DAYS)),
      readPeriodCashFlow(ids, thisMonthIso()),
      readPeriodCashFlow(ids, lastMonthIso()),
    ]).then(([curve, current, previous]) => {
      if (!active) return;
      setSummary({
        key: summaryKey,
        curve,
        monthIn: current.incoming,
        monthOut: current.outgoing,
        lastMonthNet: previous.net,
        hadLastMonth: previous.count > 0,
      });
    });
    return () => {
      active = false;
    };
  }, [counted, ready, revision, summaryKey, today]);
  const currentSummary = summary?.key === summaryKey ? summary : null;

  const nameOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "Transfer");
  }, [categories]);

  // A row's mark — the category's chosen icon, or its colour dot (§10.1) —
  // resolved here where the category list is and handed to the row like its name
  // is, so the row stays presentational.
  const glyphOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c]));
    return (id: string | null): { color: string | undefined; icon: string | null } => {
      if (!id) return { color: undefined, icon: null };
      const c = m.get(id);
      return c
        ? { color: categoryColor(c), icon: c.icon }
        : { color: categoryColorFor(id, categories), icon: null };
    };
  }, [categories]);

  // Show which wallet a row moved through only once there is more than one.
  const containerNameOf = useMemo(() => {
    const m = new Map(containers.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "");
  }, [containers]);
  const showContainer = containers.filter((c) => !c.is_archived).length > 1;
  // What else a row can be found by. The engine keeps no lookup tables, so the
  // view that has the names hands them over (§ filter.ts) — typing a category or
  // a wallet name into the search box finds the rows filed under it.
  const labelOf = useMemo(
    () => (t: Transaction) =>
      `${nameOf(t.category_id)} ${containerNameOf(t.container_id)} ${containerNameOf(t.to_container_id)}`,
    [nameOf, containerNameOf],
  );

  const rankedCategories = useMemo(
    () =>
      rankCategoriesByUsage(
        categories.filter((c) => !c.is_archived),
        usageFacts,
      ),
    [categories, usageFacts],
  );
  const rankedContainers = useMemo(
    () =>
      rankContainersByUsage(
        containers.filter((c) => !c.is_archived),
        usageFacts,
      ),
    [containers, usageFacts],
  );
  const pageSize = useMemo(
    () => pageSizeForWidth(typeof window === "undefined" ? 1024 : window.innerWidth),
    [],
  );
  const queryKey = useMemo(() => JSON.stringify([sort, filter]), [filter, sort]);
  const [paging, pageDispatch] = useReducer(
    ledgerPagingReducer,
    pageSize,
    (size) => savedPaging ?? initialLedgerPagingState(size),
  );
  const request = useRef(0);
  const loadPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      const id = ++request.current;
      pageDispatch({ type: "loading" });
      try {
        savedPagingQuery = queryKey;
        if (!filtering) {
          const page = await readLedgerPage({ sort, limit: pageSize, cursor });
          if (request.current !== id) return;
          pageDispatch({ type: "page", ...page, append });
          return;
        }

        let scanCursor = cursor;
        let matched = 0;
        let appendChunk = append;
        while (true) {
          const chunk = await scanLedgerEntries({
            sort,
            candidateLimit: SCAN_CANDIDATES,
            matchLimit: pageSize - matched,
            cursor: scanCursor,
            filter,
          });
          if (request.current !== id) return;
          matched += chunk.rows.length;
          const pageReady = chunk.complete || matched >= pageSize;
          if (pageReady) {
            pageDispatch({ type: "page", ...chunk, append: appendChunk });
            return;
          }
          pageDispatch({
            type: "provisional",
            rows: chunk.rows,
            cursor: chunk.cursor!,
            revision: chunk.revision,
            append: appendChunk,
          });
          appendChunk = true;
          scanCursor = chunk.cursor;
          await yieldToBrowser();
        }
      } catch (error) {
        if (request.current !== id) return;
        pageDispatch({
          type: "error",
          message: error instanceof Error ? error.message : "Could not load entries.",
        });
      }
    },
    [filter, filtering, pageSize, queryKey, sort],
  );

  useEffect(() => {
    savedFilter = draft;
  }, [draft]);
  useEffect(() => {
    savedPaging = paging;
  }, [paging]);
  const latestSession = useRef({ queryKey, paging, draft });
  useEffect(() => {
    latestSession.current = { queryKey, paging, draft };
  }, [draft, paging, queryKey]);
  useEffect(
    () => () => {
      const latest = latestSession.current;
      ledgerSession.save(latest.queryKey, latest.paging, latest.draft, window.scrollY);
    },
    [],
  );
  const restoredScroll = useRef(false);
  useEffect(() => {
    if (!ready || restoredScroll.current) return;
    restoredScroll.current = true;
    const saved = ledgerSession.restore(queryKey);
    if (!saved) return;
    window.requestAnimationFrame(() => window.scrollTo({ top: saved.scrollY }));
  }, [queryKey, ready]);
  const previousQuery = useRef(queryKey);
  useEffect(() => {
    if (previousQuery.current === queryKey) return;
    previousQuery.current = queryKey;
    window.scrollTo({ top: 0 });
  }, [queryKey]);
  useEffect(() => {
    if (!ready) return;
    const focus = focusId.current;
    if (focus) {
      focusId.current = null;
      const id = ++request.current;
      pageDispatch({ type: "query-change" });
      void readLedgerFocus({ id: focus, sort, limit: pageSize })
        .then((window) => {
          if (request.current !== id) return;
          savedPagingQuery = queryKey;
          pageDispatch({
            type: "page",
            rows: window.rows,
            cursor: window.cursor,
            revision: window.revision,
            complete: window.completeAfter,
            append: false,
          });
          flashRow({ id: focus, scroll: true });
          router.replace("/ledger", { scroll: false });
        })
        .catch((error: unknown) => {
          if (request.current !== id) return;
          pageDispatch({
            type: "error",
            message: error instanceof Error ? error.message : "Could not find entry.",
          });
        });
      return;
    }
    if (
      savedPagingQuery === queryKey &&
      savedPaging?.status === "ready"
    ) {
      return;
    }
    pageDispatch({ type: "query-change" });
    void loadPage(null, false);
  }, [flashRow, loadPage, pageSize, queryKey, ready, router, sort]);

  const lastLocalAdd = useRef<number | null>(null);
  useEffect(() => {
    if (!localAdd || lastLocalAdd.current === localAdd.nonce) return;
    lastLocalAdd.current = localAdd.nonce;
    request.current += 1;
    pageDispatch({ type: "local-add", id: localAdd.id });
    setDraft(NO_FILTER);
    setSort("newest");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [localAdd, setSort]);

  useEffect(() => {
    if (!ready || paging.rows.length === 0 || paging.revision === revision) return;
    let active = true;
    void readLedgerEntriesById(paging.rows.map((row) => row.id)).then((current) => {
      if (!active) return;
      pageDispatch({
        type: "revalidate",
        rows: sortRegister(applyFilter(current, filter, { label: labelOf }), sort),
        revision,
      });
    });
    return () => {
      active = false;
    };
  }, [filter, labelOf, paging.revision, paging.rows, ready, revision, sort]);

  const lastRemoteChange = useRef<number | null>(null);
  useEffect(() => {
    if (
      !remoteChange ||
      lastRemoteChange.current === remoteChange.nonce ||
      paging.rows.length === 0
    ) {
      return;
    }
    lastRemoteChange.current = remoteChange.nonce;
    let active = true;
    void readLedgerPage({ sort, limit: 1, cursor: null, filter }).then((page) => {
      if (!active) return;
      pageDispatch({
        type: "remote-change",
        revision: page.revision,
        hasNewEntries:
          sort === "newest" &&
          !filtering &&
          page.rows[0]?.id !== undefined &&
          page.rows[0]?.id !== paging.rows[0]?.id,
      });
    });
    return () => {
      active = false;
    };
  }, [filter, filtering, paging.rows, remoteChange, sort]);

  const rows = paging.rows;

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
  const carriedKey = useMemo(
    () => JSON.stringify([revision, groups.map((group) => group.day)]),
    [groups, revision],
  );
  const [carried, setCarried] = useState<{
    key: string;
    values: Map<string, number>;
  } | null>(null);
  useEffect(() => {
    if (!grouped || filtering || groups.length === 0) {
      return;
    }
    let active = true;
    const days = groups.map((group) => group.day);
    const ids = containers
      .filter(
        (container) => container.include_in_overall_balance && !container.is_archived,
      )
      .map((container) => container.id);
    void readOverallBalanceSeries(ids, days).then((values) => {
      if (active) {
        setCarried({
          key: carriedKey,
          values: new Map(days.map((day, index) => [day, values[index]])),
        });
      }
    });
    return () => {
      active = false;
    };
  }, [carriedKey, containers, filtering, grouped, groups, revision]);
  const currentCarried =
    grouped && !filtering && carried?.key === carriedKey ? carried.values : null;

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMore = useCallback(() => {
    if (paging.status === "loading" || paging.complete || paging.cursor === null) return;
    void loadPage(paging.cursor, true);
  }, [loadPage, paging.complete, paging.cursor, paging.status]);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

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
      notes: t.notes,
    };
    await dispatch(createTemplate(input));
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
        <PageHeaderSkeleton />
        <FigureSkeleton />
        <div className="bg-card overflow-hidden rounded-2xl border">
          <ListSkeleton />
        </div>
      </div>
    );

  const monthIn = currentSummary?.monthIn ?? 0;
  const monthOut = currentSummary?.monthOut ?? 0;
  const monthNet = monthIn - monthOut;
  const versusLastMonth = monthNet - (currentSummary?.lastMonthNet ?? 0);

  return (
    <div className="space-y-6">
      <section className="pt-3 pb-1">
        <Eyebrow className="hidden sm:block">Register</Eyebrow>
        <h1 className={SCREEN_TITLE_CLASS}>Ledger</h1>
        <p className="text-muted-foreground mt-3 hidden max-w-md text-sm sm:block">
          Every approved entry, with the running balance it creates.
        </p>
      </section>
      {currentSummary ? (
        <Figure
          label="Overall balance"
          cents={balance}
          series={ledgerCount > 0 ? currentSummary.curve : undefined}
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
          {currentSummary.hadLastMonth && (
            <Marginalia className="mt-2">
              {versusLastMonth === 0
                ? "level with last month"
                : `${versusLastMonth > 0 ? "up" : "down"} ${formatCents(Math.abs(versusLastMonth))} on last month`}
            </Marginalia>
          )}
        </Figure>
      ) : (
        <FigureSkeleton />
      )}

      {/* No compose bar here any more (M11 phase 5). Writing an entry is the
          FAB and the quick-add sheet, from every screen — a second, permanently
          expanded copy of the same form sat between the figure and the register
          costing a third of the page. The compose-bar pattern (§12.4) is
          unchanged and still how Categories and Containers create. */}

      {ledgerCount > 0 && (
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
              options: rankedCategories.map((c) => ({
                value: c.id,
                label: c.name,
                dot: categoryColor(c),
              })),
            },
            {
              id: "container",
              label: "Wallet",
              selected: draft.containerIds,
              onChange: (containerIds) => setDraft((d) => ({ ...d, containerIds })),
              options: rankedContainers.map((c) => ({ value: c.id, label: c.name })),
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
      {paging.newEntries && (
        <div className="flex justify-center">
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => {
              pageDispatch({ type: "jump-new" });
              window.scrollTo({ top: 0, behavior: "smooth" });
              void loadPage(null, false);
            }}
          >
            New entries
          </Button>
        </div>
      )}
      <div className="bg-card overflow-clip rounded-2xl border">
        {paging.status === "loading" && rows.length === 0 ? (
          <ListSkeleton rows={pageSize === 25 ? 5 : 8} />
        ) : paging.status === "error" && rows.length === 0 ? (
          <EmptyState
            title="Entries could not be loaded"
            action={
              <Button variant="outline" size="sm" onClick={() => void loadPage(null, false)}>
                Retry
              </Button>
            }
          >
            Nothing was treated as missing. Try the read again.
          </EmptyState>
        ) : rows.length === 0 ? (
          // Filtering the last row away is still "nothing logged yet", not a
          // filter you can widen.
          filtering && ledgerCount > 0 ? (
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
              {ledgerCount} entr{ledgerCount === 1 ? "y is" : "ies are"} in the register —
              widen the filters to see them.
            </EmptyState>
          ) : categories.length === 0 ? (
            // First run: you cannot file an entry before a category exists, so the
            // empty register invites the one thing that unblocks everything else
            // (§12.6 — invite, don't shrug).
            <EmptyState
              icon={SparklesIcon}
              title="Welcome to yaccount"
              action={
                <Button asChild className="rounded-full">
                  <Link href="/categories">Add your first category</Link>
                </Button>
              }
            >
              Start with a category or two for what your money does — groceries, rent,
              salary. Every entry you log is filed under one.
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
              <DayHeader day={g.day} carried={currentCarried?.get(g.day) ?? null} />
              {g.items.map((t) => (
                <LedgerRow
                  key={t.id}
                  tx={t}
                  flashed={flashed?.id === t.id ? flashed : null}
                  when={showsTime(g.day) ? formatEnteredTime(t.entered_at) : null}
                  glyph={glyphOf(t.category_id)}
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
                glyph={glyphOf(t.category_id)}
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
        {rows.length > 0 && !paging.complete && (
          <div ref={loadMoreRef} className="flex justify-center border-t px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={paging.status === "loading"}
              onClick={loadMore}
            >
              {paging.status === "loading" ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
        {paging.status === "error" && rows.length > 0 && (
          <div className="flex items-center justify-center gap-3 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">More entries unknown.</span>
            <Button variant="ghost" size="sm" onClick={loadMore}>
              Retry
            </Button>
          </div>
        )}
      </div>

      <EditTransactionSheet
        editing={editing}
        categories={categories}
        containers={containers}
        transactions={usageFacts}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={async (op) => {
          await dispatch(op);
          setEditing(null);
          if (op.type === "transaction.update") flashRow({ id: op.payload.row.id });
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
  glyph,
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
  /** The category's mark (icon + colour), resolved by the parent. */
  glyph: { color: string | undefined; icon: string | null };
  categoryName: string;
  containerName: string;
  toContainerName: string;
  onEdit: () => void;
  onDelete: () => void;
  onSaveShortcut: () => void;
}) {
  const transfer = isTransfer(tx);
  // Only a row found through ⌘K or a `?focus=` link scrolls; a row you just
  // logged is already at the top. The rule lives in `useFlashRow` now, shared
  // with the four screens that grew the same landing.
  const { ref: row } = useFlashRow(tx.id);
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
        <span className="inline-flex size-4 shrink-0 items-center justify-center">
          <ArrowRightIcon className="text-muted-foreground size-2.5" aria-hidden />
        </span>
      ) : (
        <CategoryGlyph icon={glyph.icon} color={glyph.color} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{tx.vendor_source}</div>
        <div className="text-muted-foreground truncate text-xs">{sub}</div>
        {tx.notes && (
          <div className="text-muted-foreground/80 mt-0.5 truncate text-xs">
            {tx.notes}
          </div>
        )}
      </div>
      <Money
        cents={tx.amount}
        absolute={transfer}
        tone={transfer ? "quiet" : income ? "in" : "neutral"}
        className="text-sm tracking-tight"
      />
      <RowActions label={`Actions for ${tx.vendor_source}`}>
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
      </RowActions>
    </div>
  );
}
