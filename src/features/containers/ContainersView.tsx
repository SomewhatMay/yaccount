"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArchiveIcon,
  CheckIcon,
  LineChartIcon,
  MoreHorizontalIcon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind = "plain" | "investment";

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

  const active = useMemo(
    () =>
      containers
        .filter((c) => !c.is_archived)
        .sort((a, b) =>
          a.id === GENERAL_CONTAINER_ID
            ? -1
            : b.id === GENERAL_CONTAINER_ID
              ? 1
              : a.name.localeCompare(b.name),
        ),
    [containers],
  );
  const archivedCount = containers.length - active.length;

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
    if (active.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
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
    toast.success("Archived", { description: c.name });
  }

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="pt-3 pb-1">
        <h1 className="font-display text-3xl leading-none">Containers</h1>
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

      <div className="bg-card overflow-hidden rounded-2xl border">
        {active.map((c, i) => (
          <ContainerRow
            key={c.id}
            container={c}
            divider={i > 0}
            balance={containerBalance(transactions, c.id)}
            contributed={netContributions(transactions, c.id)}
            snapshot={latestSnapshot.get(c.id)}
            isDefault={c.id === defaultId}
            onDispatch={dispatch}
            onLogBalance={() => setLogging(c)}
            onArchive={() => setArchiving(c)}
          />
        ))}
      </div>

      {archivedCount > 0 && (
        <p className="text-muted-foreground text-xs">
          {archivedCount} archived — hidden here, still valid on past transactions.
        </p>
      )}

      <LogBalanceSheet
        container={logging}
        onOpenChange={(open) => !open && setLogging(null)}
        onSave={async (op) => {
          await dispatch(op);
          setLogging(null);
        }}
      />

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves your pickers and this list. Past transactions keep it, and nothing
              is deleted — you can still see its history.
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
  contributed: number;
  snapshot: ContainerSnapshot | undefined;
  isDefault: boolean;
  onDispatch: (op: ReturnType<typeof updateContainer>) => Promise<void>;
  onLogBalance: () => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(container.name);

  async function rename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== container.name) {
      await onDispatch(updateContainer({ ...container, name: trimmed }));
      toast.success("Renamed", { description: trimmed });
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
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-8"
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
      <div
        className={cn(
          "tnum font-mono text-sm tracking-tight",
          balance < 0 && "text-destructive",
        )}
      >
        {formatCents(balance)}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Actions for ${container.name}`}
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <PencilIcon className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleCounted}>
            <CheckIcon className="size-4" />
            {container.include_in_overall_balance
              ? "Stop counting in overall balance"
              : "Count in overall balance"}
          </DropdownMenuItem>
          {!isDefault && (
            <DropdownMenuItem onClick={makeDefault}>
              <WalletIcon className="size-4" />
              Make default wallet
            </DropdownMenuItem>
          )}
          {container.is_investment && (
            <DropdownMenuItem onClick={onLogBalance}>
              <LineChartIcon className="size-4" />
              Log reported balance
            </DropdownMenuItem>
          )}
          {container.id !== GENERAL_CONTAINER_ID && (
            <DropdownMenuItem variant="destructive" onClick={onArchive}>
              <ArchiveIcon className="size-4" />
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
