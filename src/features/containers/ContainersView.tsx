"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  const archivingBalance = archiving ? containerBalance(transactions, archiving.id) : 0;

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
  const archived = useMemo(
    () =>
      containers
        .filter((c) => c.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [containers],
  );

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
            siblings={containers}
            contributed={netContributions(transactions, c.id)}
            snapshot={latestSnapshot.get(c.id)}
            isDefault={c.id === defaultId}
            onDispatch={dispatch}
            onLogBalance={() => setLogging(c)}
            onArchive={() => setArchiving(c)}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <section>
          <div className="text-muted-foreground mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-xs font-medium tracking-[0.14em] uppercase">Archived</h2>
            <span className="tnum font-mono text-xs">{archived.length}</span>
          </div>
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
                <span className="tnum text-muted-foreground font-mono text-sm">
                  {formatCents(containerBalance(transactions, c.id))}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-8 rounded-lg"
                  onClick={() => restore(c)}
                >
                  <ArchiveRestoreIcon className="size-4" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2 px-1 text-xs">
            Out of your pickers and out of the overall balance, but nothing was deleted —
            restore any time.
          </p>
        </section>
      )}

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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
