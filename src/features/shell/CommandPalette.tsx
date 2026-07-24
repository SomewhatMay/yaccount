"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTheme } from "next-themes";
import {
  ArrowRightIcon,
  MoonIcon,
  PlusIcon,
  RefreshCwIcon,
  SunIcon,
  type LucideIcon,
} from "lucide-react";
import { activeRows, searchTransactions, sortForRegister } from "@/core/engine";
import { formatCents } from "@/core/money";
import type { Transaction } from "@/core/model";
import {
  categoriesAtom,
  commandPaletteAtom,
  flashRowAtom,
  quickAddAtom,
  syncAtom,
  transactionsAtom,
} from "@/features/store";
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
 * ⌘K — desktop power at zero mobile cost. Jump to any screen, start an entry, or
 * find a transaction you half-remember.
 *
 * Filtering is ours, not cmdk's (`shouldFilter={false}`): the register is
 * searched by the engine's `searchTransactions`, so the palette narrows a payee
 * exactly the way the ledger's own filters will, and one rule covers both.
 */
export function CommandPalette() {
  const [open, setOpen] = useAtom(commandPaletteAtom);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const transactions = useAtomValue(transactionsAtom);
  const categories = useAtomValue(categoriesAtom);
  const openQuickAdd = useSetAtom(quickAddAtom);
  const flashRow = useSetAtom(flashRowAtom);
  const sync = useSetAtom(syncAtom);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const categoryName = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (t: Transaction) =>
      t.category_id ? (m.get(t.category_id) ?? "") : "Transfer";
  }, [categories]);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const destinations = DESTINATIONS.filter((d) =>
    terms.every((t) => `${d.label} ${d.hint}`.toLowerCase().includes(t)),
  );
  // Only while it is open: the palette lives in the shell, so this would
  // otherwise re-sort the whole register on every write, on every screen.
  const rows = useMemo(
    () => (open ? sortForRegister(activeRows(transactions)) : []),
    [open, transactions],
  );
  const found = searchTransactions(rows, query, { label: categoryName, limit: 6 });

  function run(action: () => void) {
    setOpen(false);
    setQuery("");
    action();
  }

  const dark = resolvedTheme === "dark";
  const actions: { icon: LucideIcon; label: string; run: () => void }[] = [
    { icon: PlusIcon, label: "Log an expense", run: () => openQuickAdd("expense") },
    { icon: PlusIcon, label: "Log income", run: () => openQuickAdd("income") },
    {
      icon: ArrowRightIcon,
      label: "Move money between containers",
      run: () => openQuickAdd("transfer"),
    },
    { icon: RefreshCwIcon, label: "Sync with Drive now", run: () => void sync() },
    {
      icon: dark ? SunIcon : MoonIcon,
      label: dark ? "Switch to light theme" : "Switch to dark theme",
      run: () => setTheme(dark ? "light" : "dark"),
    },
  ].filter((a) => terms.every((t) => a.label.toLowerCase().includes(t)));

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      title="Search yaccount"
      description="Jump to a screen, log an entry, or find a transaction."
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search screens, actions and entries…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Nothing matched that.</CommandEmpty>

          {destinations.length > 0 && (
            <CommandGroup heading="Go to">
              {destinations.map((d) => (
                <CommandItem
                  key={d.href}
                  value={d.href}
                  onSelect={() => run(() => router.push(d.href))}
                >
                  <d.icon className="size-4" />
                  <span>{d.label}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{d.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {found.length > 0 && (
            <CommandGroup heading="Entries">
              {found.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`tx-${t.id}`}
                  onSelect={() =>
                    run(() => {
                      // Land on the register with the row marked and brought
                      // into view — a result you can't find is not a result.
                      router.push("/ledger");
                      flashRow({ id: t.id, scroll: true });
                    })
                  }
                >
                  <span className="truncate">{t.vendor_source}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {categoryName(t)} · {t.date}
                  </span>
                  <span className="tnum ml-auto font-mono text-xs">
                    {formatCents(t.amount)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {actions.length > 0 && (
            <CommandGroup heading="Do">
              {actions.map((a) => (
                <CommandItem
                  key={a.label}
                  value={a.label}
                  onSelect={() => run(() => a.run())}
                >
                  <a.icon className="size-4" />
                  <span>{a.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
