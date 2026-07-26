"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTheme } from "next-themes";
import {
  ArrowRightIcon,
  BookmarkIcon,
  ListIcon,
  MoonIcon,
  PlusIcon,
  RefreshCwIcon,
  RepeatIcon,
  SunIcon,
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
  recurringRulesAtom,
  syncAtom,
  transactionsAtom,
} from "@/features/store";
import { focusHref } from "@/features/focus-link";
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
 * ⌘K — one ranked answer over everything the app holds.
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
  action: "Do",
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
  const flashRow = useSetAtom(flashRowAtom);
  const sync = useSetAtom(syncAtom);
  const { resolvedTheme, setTheme } = useTheme();

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

  const dark = resolvedTheme === "dark";
  const actions = useMemo(
    () => [
      {
        id: "act:expense",
        title: "Log an expense",
        icon: PlusIcon,
        go: () => openQuickAdd("expense"),
      },
      {
        id: "act:income",
        title: "Log income",
        icon: PlusIcon,
        go: () => openQuickAdd("income"),
      },
      {
        id: "act:transfer",
        title: "Move money between containers",
        icon: ArrowRightIcon,
        go: () => openQuickAdd("transfer"),
      },
      {
        id: "act:sync",
        title: "Sync with Drive now",
        icon: RefreshCwIcon,
        go: () => void sync(),
      },
      {
        id: "act:theme",
        title: dark ? "Switch to light theme" : "Switch to dark theme",
        icon: dark ? SunIcon : MoonIcon,
        go: () => setTheme(dark ? "light" : "dark"),
      },
    ],
    [dark, openQuickAdd, setTheme, sync],
  );

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
        subtitle: "",
      })),
    ],
    [actions],
  );

  // Only while it is open: the palette lives in the shell, so this would
  // otherwise re-index the whole world on every write, on every screen.
  const index = useMemo(
    () =>
      open
        ? buildSearchIndex({ transactions, categories, containers, goals, rules, extras })
        : null,
    [open, transactions, categories, containers, goals, rules, extras],
  );
  const session = useMemo(() => (index ? createSession(index) : null), [index]);

  // Typing stays responsive even when the ledger is large: React renders the
  // keystroke first and the results a beat later, rather than blocking on them.
  const deferred = useDeferredValue(query);
  const blank = deferred.trim() === "";
  const words = useMemo(() => parseQuery(deferred).words, [deferred]);

  const results = useMemo(() => {
    if (!session) return [];
    // Nothing typed is not "nothing": show where to go, what to do, and the
    // entries you most recently wrote — a starting page, not an empty one.
    if (blank) {
      return session
        .search("", { limit: 60, perKind: 6 })
        .filter(
          (r) =>
            r.doc.kind === "destination" ||
            r.doc.kind === "action" ||
            r.doc.kind === "transaction",
        )
        .slice(0, 16);
    }
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
      if (kind === "action") return actions.find((a) => a.id === id)?.go();
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
      description="Jump to a screen, log an entry, or find anything you have recorded."
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search everything — try a note, an amount, or is:transfer"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
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
                      <span className="tnum ml-auto font-mono text-xs">{r.doc.meta}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
