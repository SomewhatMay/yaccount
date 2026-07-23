"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  LineChartIcon,
  PencilIcon,
  PlusIcon,
  WalletIcon,
} from "lucide-react";
import {
  containersAtom,
  defaultContainerIdAtom,
  dispatchAtom,
  readyAtom,
  snapshotsAtom,
  transactionsAtom,
} from "@/features/store";
import {
  archiveContainer,
  createContainer,
  setDefaultContainer,
  unarchiveContainer,
  updateContainer,
} from "@/core/commands";
import { containerBalance, netContributions } from "@/core/engine/balances";
import { formatCents } from "@/core/money";
import {
  GENERAL_CONTAINER_ID,
  type Container,
  type ContainerSnapshot,
} from "@/core/model";
import { cn } from "@/lib/utils";
import { LogBalanceSheet } from "@/features/containers/LogBalanceSheet";
import {
  activeContainerFilterCount,
  applyContainerFilter,
  isContainerSort,
  sortContainers,
  type ContainerFilter,
  type ContainerKind,
  type ContainerState,
  type CountedState,
} from "@/features/containers/filter";
import { useLocalPref } from "@/features/prefs";
import { FilterBar } from "@/features/FilterBar";
import { RenameField } from "@/features/RenameField";
import { nameTaken } from "@/features/unique-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollapsibleSection, EmptyState, Money, RowActions } from "@/features/ui";

type Kind = "plain" | "investment";

/** Device-local: how you like to READ the list, not a fact about your money. */
const SORT_KEY = "yaccount.containers.sort";

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "balance", label: "Balance" },
] as const;

const KINDS: { value: ContainerKind; label: string }[] = [
  { value: "plain", label: "Wallet" },
  { value: "investment", label: "Investment" },
];

const COUNTED: { value: CountedState; label: string }[] = [
  { value: "counted", label: "Counted" },
  { value: "uncounted", label: "Not counted" },
];

const STATES: { value: ContainerState; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

interface ContainerDraft {
  text: string;
  kinds: ContainerKind[];
  counted: CountedState[];
  states: ContainerState[];
}

const NO_FILTER: ContainerDraft = { text: "", kinds: [], counted: [], states: [] };

export function ContainersView() {
  const ready = useAtomValue(readyAtom);
  const containers = useAtomValue(containersAtom);
  const transactions = useAtomValue(transactionsAtom);
  const snapshots = useAtomValue(snapshotsAtom);
  const defaultId = useAtomValue(defaultContainerIdAtom);
  const dispatch = useSetAtom(dispatchAtom);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("plain");
  const [logging, setLogging] = useState<Container | null>(null);
  const [archiving, setArchiving] = useState<Container | null>(null);
  const archivingBalance = archiving ? containerBalance(transactions, archiving.id) : 0;

  // Sort is remembered; the filters are deliberately not (§12.4 M11).
  const [sort, setSort] = useLocalPref(SORT_KEY, "name", isContainerSort);
  const [draft, setDraft] = useState<ContainerDraft>(NO_FILTER);
  const filter: ContainerFilter = draft;
  const filtering = activeContainerFilterCount(filter) > 0;

  const balanceOf = useMemo(
    () => (c: Container) => containerBalance(transactions, c.id),
    [transactions],
  );

  const shown = useMemo(
    () =>
      sortContainers(applyContainerFilter(containers, filter), sort, {
        balance: balanceOf,
      }),
    [containers, filter, sort, balanceOf],
  );

  const active = useMemo(() => shown.filter((c) => !c.is_archived), [shown]);
  const archived = useMemo(() => shown.filter((c) => c.is_archived), [shown]);

  const latestSnapshot = useMemo(() => {
    const by = new Map<string, ContainerSnapshot>();
    for (const s of snapshots) {
      const cur = by.get(s.container_id);
      if (!cur || s.date >= cur.date) by.set(s.container_id, s);
    }
    return by;
  }, [snapshots]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name the container.");
    if (nameTaken(containers, trimmed)) {
      return toast.error("You already have a container with that name.");
    }
    await dispatch(
      createContainer({ name: trimmed, is_investment: kind === "investment" }),
    );
    toast.success("Container added", {
      description: `${trimmed} · not counted in your overall balance yet`,
    });
    setName("");
  }

  async function archive(c: Container) {
    setArchiving(null);
    await dispatch(archiveContainer(c.id));
    toast.success("Archived", {
      description: c.name,
      action: {
        label: "Undo",
        onClick: () => {
          void restore(c);
        },
      },
    });
  }

  async function restore(c: Container) {
    await dispatch(unarchiveContainer(c.id));
    toast.success("Restored", {
      description: `${c.name} is back${c.include_in_overall_balance ? " and counting again" : ""}`,
    });
  }

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="pt-3 pb-1">
        <h1 className="figure-lg">Containers</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Where your money lives. Only the ones you count show up in your overall balance.
        </p>
      </section>

      <form
        onSubmit={add}
        className="border-primary/15 bg-primary/[0.04] rounded-2xl border p-2"
      >
        <div className="grid grid-cols-2 items-center gap-1.5 sm:grid-cols-[1fr_9.5rem_auto]">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name a container (e.g. Vacation)"
            aria-label="Container name"
            className="col-span-2 border-0 bg-transparent shadow-none focus-visible:ring-0 sm:col-span-1"
          />
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger
              aria-label="Container kind"
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plain">Plain</SelectItem>
              <SelectItem value="investment">Investment</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            size="icon"
            aria-label="Add container"
            className="justify-self-end rounded-xl"
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
      </form>

      {containers.length > 0 && (
        <FilterBar
          search={draft.text}
          onSearch={(text) => setDraft((d) => ({ ...d, text }))}
          searchPlaceholder="Search containers"
          facets={[
            {
              id: "kind",
              label: "Type",
              selected: draft.kinds,
              onChange: (kinds) =>
                setDraft((d) => ({ ...d, kinds: kinds as ContainerKind[] })),
              options: KINDS,
            },
            {
              id: "counted",
              label: "Counted",
              selected: draft.counted,
              onChange: (counted) =>
                setDraft((d) => ({ ...d, counted: counted as CountedState[] })),
              options: COUNTED,
            },
            {
              id: "state",
              label: "Status",
              selected: draft.states,
              onChange: (states) =>
                setDraft((d) => ({ ...d, states: states as ContainerState[] })),
              options: STATES,
            },
          ]}
          sort={{ value: sort, options: [...SORT_OPTIONS], onChange: setSort }}
          activeCount={activeContainerFilterCount(filter)}
          onClear={() => setDraft(NO_FILTER)}
        />
      )}

      <div className="bg-card overflow-hidden rounded-2xl border">
        {active.length === 0 ? (
          filtering ? (
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
              {containers.length} container{containers.length === 1 ? "" : "s"} — widen
              the filters to see them.
            </EmptyState>
          ) : (
            <EmptyState icon={WalletIcon} title="No containers yet">
              Add one above for each place your money actually sits — a bank account, a
              savings pot, a brokerage.
            </EmptyState>
          )
        ) : (
          active.map((c, i) => (
            <ContainerRow
              key={c.id}
              container={c}
              divider={i > 0}
              balance={balanceOf(c)}
              siblings={containers}
              contributed={netContributions(transactions, c.id)}
              snapshot={latestSnapshot.get(c.id)}
              isDefault={c.id === defaultId}
              onDispatch={dispatch}
              onLogBalance={() => setLogging(c)}
              onArchive={() => setArchiving(c)}
            />
          ))
        )}
      </div>

      {/* Folded away by default (§12.4 M11 responsive density) — an archived
          container is out of your pickers and out of the balance, so it is never
          why you opened this screen. The count and Restore stay reachable (§1.1). */}
      <CollapsibleSection
        title="Archived"
        count={archived.length}
        note="Out of your pickers and out of the overall balance, but nothing was deleted — restore any time."
      >
        <div className="bg-card/50 overflow-hidden rounded-2xl border border-dashed">
          {archived.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "group hover:bg-muted/40 flex items-center gap-3 px-5 py-2.5 transition-colors",
                i > 0 && "border-t border-dashed",
              )}
            >
              <ArchiveIcon
                className="text-muted-foreground size-4 shrink-0 opacity-60"
                aria-hidden
              />
              <span className="text-muted-foreground flex-1 truncate text-sm">
                {c.name}
              </span>
              <Money cents={balanceOf(c)} tone="quiet" className="text-sm" />
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-8 shrink-0 rounded-lg"
                onClick={() => restore(c)}
              >
                <ArchiveRestoreIcon className="size-4" />
                Restore
              </Button>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <LogBalanceSheet
        container={logging}
        snapshots={snapshots}
        onOpenChange={(open) => !open && setLogging(null)}
        onDispatch={dispatch}
      />

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {archivingBalance !== 0 ? (
                <>
                  It still holds{" "}
                  <span className="tnum text-foreground font-mono">
                    {formatCents(archivingBalance)}
                  </span>
                  , which stops counting toward your overall balance once it&apos;s
                  archived. Move the money first if you want it to keep showing.
                </>
              ) : (
                <>It leaves your pickers and this list.</>
              )}{" "}
              Past transactions keep it, and nothing is deleted — you can still see its
              history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiving && archive(archiving)}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContainerRow({
  container,
  divider,
  balance,
  siblings,
  contributed,
  snapshot,
  isDefault,
  onDispatch,
  onLogBalance,
  onArchive,
}: {
  container: Container;
  divider: boolean;
  balance: number;
  siblings: Container[];
  contributed: number;
  snapshot: ContainerSnapshot | undefined;
  isDefault: boolean;
  onDispatch: (op: ReturnType<typeof updateContainer>) => Promise<void>;
  onLogBalance: () => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);

  async function rename(name: string) {
    if (name !== container.name) {
      await onDispatch(updateContainer({ ...container, name }));
      toast.success("Renamed", { description: name });
    }
    setEditing(false);
  }

  async function toggleCounted() {
    const counted = !container.include_in_overall_balance;
    await onDispatch(
      updateContainer({ ...container, include_in_overall_balance: counted }),
    );
    toast.success(counted ? "Counted in overall balance" : "No longer counted", {
      description: container.name,
    });
  }

  async function toggleInvestment() {
    const investment = !container.is_investment;
    await onDispatch(updateContainer({ ...container, is_investment: investment }));
    toast.success(investment ? "Tracked as an investment" : "No longer an investment", {
      description: investment
        ? `Report ${container.name}'s real-world value anytime`
        : container.name,
    });
  }

  async function makeDefault() {
    await onDispatch(setDefaultContainer(container.id));
    toast.success("Default wallet", { description: container.name });
  }

  const marginalia = [
    container.include_in_overall_balance ? "counted" : "not counted",
    container.is_investment ? `contributed ${formatCents(contributed)}` : null,
    container.is_investment && snapshot
      ? `reported ${formatCents(snapshot.reported_balance)} on ${snapshot.date}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "group hover:bg-muted/40 flex items-center gap-3 px-5 py-3 transition-colors",
        divider && "border-t",
      )}
    >
      {container.is_investment ? (
        <LineChartIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      ) : (
        <WalletIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {editing ? (
          <RenameField
            value={container.name}
            label={`Rename ${container.name}`}
            validate={(next) =>
              nameTaken(siblings, next, container.id) ? "That name is taken." : null
            }
            onSave={rename}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{container.name}</span>
            {isDefault && (
              <Badge variant="secondary" className="rounded-full text-[10px]">
                Default
              </Badge>
            )}
          </div>
        )}
        <div className="text-muted-foreground truncate text-xs">
          {marginalia.join(" · ")}
        </div>
      </div>
      <Money
        cents={balance}
        tone={balance < 0 ? "alert" : "neutral"}
        className="text-sm tracking-tight"
      />
      <RowActions label={`Actions for ${container.name}`}>
        <DropdownMenuItem onClick={() => setEditing(true)}>
          <PencilIcon className="size-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          checked={container.include_in_overall_balance}
          onCheckedChange={toggleCounted}
        >
          Count in overall balance
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={container.is_investment}
          onCheckedChange={toggleInvestment}
        >
          Track as an investment
        </DropdownMenuCheckboxItem>
        {!isDefault && (
          <DropdownMenuItem onClick={makeDefault}>
            <WalletIcon className="size-4" />
            Make default wallet
          </DropdownMenuItem>
        )}
        {container.is_investment && (
          <DropdownMenuItem onClick={onLogBalance}>
            <LineChartIcon className="size-4" />
            Reported balances
          </DropdownMenuItem>
        )}
        {container.id !== GENERAL_CONTAINER_ID && <DropdownMenuSeparator />}
        {container.id !== GENERAL_CONTAINER_ID && (
          <DropdownMenuItem variant="destructive" onClick={onArchive}>
            <ArchiveIcon className="size-4" />
            Archive
          </DropdownMenuItem>
        )}
      </RowActions>
    </div>
  );
}
