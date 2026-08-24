"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  ArrowRightIcon,
  BookmarkIcon,
  LineChartIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  RepeatIcon,
  TagsIcon,
  TargetIcon,
  WalletIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import {
  buildSearchIndex,
  createSession,
  matchRanges,
  parseQuery,
  type DocKind,
  type SearchExtra,
  type SearchResult,
} from "@/core/engine";
import {
  categoriesAtom,
  commandPaletteAtom,
  containersAtom,
  flashRowAtom,
  goalsAtom,
  quickAddAtom,
  reportedBalanceContainerIdAtom,
  recurringRulesAtom,
  syncAtom,
  transactionsAtom,
} from "@/features/store";
import { focusHref } from "@/features/focus-link";
import { buildInvestmentValueActions } from "@/features/shell/command-actions";
import {
  commandDefaultGroups,
  rememberCommandAction,
  useCommandHistory,
} from "@/features/shell/command-history";
import { needsCommandIndex } from "@/features/shell/command-state";
import { DESTINATIONS } from "@/features/shell/nav";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandDialog,
} from "@/components/ui/command";

/**
 * ⌘K — common/recent actions before typing, then one ranked answer over
 * everything the app holds.
 *
 * Filtering and ranking are the engine's (`core/engine/search.ts`), not cmdk's
 * (`shouldFilter={false}`): the index is built once per data change, so a
 * keystroke costs a scan of pre-lowercased strings rather than a fresh
 * `toLowerCase` per row — and a `createSession` rescans only what still matched,
 * so the ledger is paid for on the first character and never again.
 */

/** What each kind is called on screen, in the order the groups fall back to. */
const HEADING: Record<DocKind, string> = {
  destination: "Go to",
  action: "Actions",
  transaction: "Entries",
  template: "Shortcuts",
  category: "Categories",
  container: "Containers",
  goal: "Goals",
  rule: "Recurring",
};

const KIND_ICON: Record<DocKind, LucideIcon> = {
  destination: ArrowRightIcon,
  action: ZapIcon,
  transaction: ListIcon,
  template: BookmarkIcon,
  category: TagsIcon,
  container: WalletIcon,
  goal: TargetIcon,
  rule: RepeatIcon,
};

type PaletteAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  go: () => void;
};

/** The hit, underlined. Nothing matched means nothing marked — not a lie. */
function Marked({ text, words }: { text: string; words: string[] }) {
  const ranges = useMemo(() => matchRanges(text, words), [text, words]);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={i} className="bg-primary/25 rounded-[2px] text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function ActionItem({
  action,
  onSelect,
}: {
  action: PaletteAction;
  onSelect: () => void;
}) {
  const Icon = action.icon;
  return (
    <CommandItem value={action.id} onSelect={onSelect}>
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{action.title}</span>
      {action.subtitle && (
        <span className="text-muted-foreground truncate text-xs">{action.subtitle}</span>
      )}
    </CommandItem>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useAtom(commandPaletteAtom);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const transactions = useAtomValue(transactionsAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const goals = useAtomValue(goalsAtom);
  const rules = useAtomValue(recurringRulesAtom);
  const openQuickAdd = useSetAtom(quickAddAtom);
  const reportBalance = useSetAtom(reportedBalanceContainerIdAtom);
  const flashRow = useSetAtom(flashRowAtom);
  const sync = useSetAtom(syncAtom);
  const [history, setHistory] = useCommandHistory();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Bare ⌘K only: ⌥⌘K and ⇧⌘K belong to the browser and to whatever the
      // user has bound them to.
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setOpen((was) => !was); // the same key closes it — it is a toggle
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  function run(action: () => void) {
    setOpen(false);
    setQuery("");
    action();
  }

  const actions = useMemo<PaletteAction[]>(
    () => [
      {
        id: "act:expense",
        title: "Log an expense",
        subtitle: "",
        icon: PlusIcon,
        go: () => openQuickAdd("expense"),
      },
      {
        id: "act:income",
        title: "Log income",
        subtitle: "",
        icon: PlusIcon,
        go: () => openQuickAdd("income"),
      },
      {
        id: "act:transfer",
        title: "Move money between containers",
        subtitle: "",
        icon: ArrowRightIcon,
        go: () => openQuickAdd("transfer"),
      },
      ...buildInvestmentValueActions(containers).map((action) => ({
        ...action,
        icon: LineChartIcon,
        go: () => reportBalance(action.containerId),
      })),
      {
        id: "act:sync",
        title: "Sync with Drive now",
        subtitle: "",
        icon: RefreshCwIcon,
        go: () => void sync(),
      },
    ],
    [containers, openQuickAdd, reportBalance, sync],
  );
  const actionIds = useMemo(() => actions.map((action) => action.id), [actions]);
  const defaults = useMemo(
    () => commandDefaultGroups(actions, history),
    [actions, history],
  );

  function executeAction(action: PaletteAction) {
    setHistory(rememberCommandAction(history, action.id, actionIds));
    action.go();
  }

  // The shell's own rows — screens and actions — handed to the engine as docs so
  // one ranking covers all three, instead of three lists racing each other.
  const extras = useMemo<SearchExtra[]>(
    () => [
      ...DESTINATIONS.map((d) => ({
        id: d.href,
        kind: "destination" as const,
        title: d.label,
        subtitle: d.hint,
      })),
      ...actions.map((a) => ({
        id: a.id,
        kind: "action" as const,
        title: a.title,
        subtitle: a.subtitle,
      })),
    ],
    [actions],
  );

  // Only while it is open: the palette lives in the shell, so this would
  // otherwise re-index the whole world on every write, on every screen.
  const needsIndex = needsCommandIndex(open, query);
  const index = useMemo(
    () =>
      needsIndex
        ? buildSearchIndex({ transactions, categories, containers, goals, rules, extras })
        : null,
    [needsIndex, transactions, categories, containers, goals, rules, extras],
  );
  const session = useMemo(() => (index ? createSession(index) : null), [index]);

  // Typing stays responsive even when the ledger is large: React renders the
  // keystroke first and the results a beat later, rather than blocking on them.
  const deferred = useDeferredValue(query);
  const blank = deferred.trim() === "";
  const words = useMemo(() => parseQuery(deferred).words, [deferred]);

  const results = useMemo(() => {
    if (!session) return [];
    // Blank is a curated action page below. Engine ranking begins once there is
    // a query, where destinations and every recorded entity remain searchable.
    if (blank) return [];
    return session.search(deferred, { limit: 24, perKind: 5 });
  }, [session, deferred, blank]);

  // Grouped, but ordered by the best hit in each group — so whatever ⏎ would
  // select is always in the first group, wherever it came from.
  const groups = useMemo(() => {
    const byKind = new Map<DocKind, SearchResult[]>();
    for (const r of results) {
      const bucket = byKind.get(r.doc.kind);
      if (bucket) bucket.push(r);
      else byKind.set(r.doc.kind, [r]);
    }
    return [...byKind.entries()];
  }, [results]);

  function select(result: SearchResult) {
    const { id, kind } = result.doc;
    run(() => {
      if (kind === "destination") return router.push(id);
      if (kind === "action") {
        const action = actions.find((candidate) => candidate.id === id);
        if (action) executeAction(action);
        return;
      }
      if (kind === "transaction") {
        // Land on the register with the row marked and brought into view — a
        // result you can't find is not a result.
        router.push("/ledger");
        return flashRow({ id, scroll: true });
      }
      if (kind === "template") {
        // A shortcut is not a register row; it lives in Quick Add, so that is
        // where choosing one goes.
        const t = transactions.find((row) => row.id === id);
        return openQuickAdd(
          t?.to_container_id ? "transfer" : (t?.amount ?? 0) >= 0 ? "income" : "expense",
        );
      }
      const path =
        kind === "category"
          ? "/categories"
          : kind === "container"
            ? "/containers"
            : kind === "goal"
              ? "/goals"
              : "/recurring";
      router.push(focusHref(path, id));
    });
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      title="Search yaccount"
      description="Run a common action or find anything you have recorded."
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search everything — try a note, an amount, or is:transfer"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {blank ? (
            <>
              {defaults.recent.length > 0 && (
                <CommandGroup heading="Recent actions">
                  {defaults.recent.map((action) => (
                    <ActionItem
                      key={action.id}
                      action={action}
                      onSelect={() => run(() => executeAction(action))}
                    />
                  ))}
                </CommandGroup>
              )}
              {defaults.common.length > 0 && (
                <CommandGroup heading="Common actions">
                  {defaults.common.map((action) => (
                    <ActionItem
                      key={action.id}
                      action={action}
                      onSelect={() => run(() => executeAction(action))}
                    />
                  ))}
                </CommandGroup>
              )}
            </>
          ) : (
            <>
              <CommandEmpty>Nothing matched that.</CommandEmpty>

              {groups.map(([kind, rows]) => (
                <CommandGroup key={kind} heading={HEADING[kind]}>
                  {rows.map((r) => {
                    const Icon = KIND_ICON[kind];
                    return (
                      <CommandItem
                        key={r.doc.id}
                        value={r.doc.id}
                        onSelect={() => select(r)}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">
                          <Marked text={r.doc.title} words={words} />
                        </span>
                        {r.doc.subtitle && (
                          <span className="text-muted-foreground truncate text-xs">
                            <Marked text={r.doc.subtitle} words={words} />
                          </span>
                        )}
                        {r.doc.meta && (
                          <span className="tnum ml-auto font-mono text-xs">
                            {r.doc.meta}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
