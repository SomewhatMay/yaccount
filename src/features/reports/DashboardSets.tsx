"use client";

import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  GripVerticalIcon,
  PlusIcon,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveSheet, RowActions } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { DashboardDefinition, DashboardStarter } from "./dashboard-layout";

const STARTERS: {
  id: DashboardStarter;
  title: string;
  description: string;
}[] = [
  {
    id: "planning",
    title: "Planning",
    description: "Budget pace, cash commitments, and goals.",
  },
  {
    id: "trends",
    title: "Trends",
    description: "Period changes, monthly history, and investments.",
  },
  {
    id: "current",
    title: "Current dashboard",
    description: "Copy these widgets and their settings.",
  },
  {
    id: "empty",
    title: "Empty",
    description: "Start with Overall balance only.",
  },
];

export interface DashboardSetBarProps {
  dashboards: DashboardDefinition[];
  activeId: string;
  defaultId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string, starter: DashboardStarter) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onReorder: (activeId: string, overId: string) => Promise<void>;
  onMakeDefault: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  manageOpen?: boolean;
  onManageOpenChange?: (open: boolean) => void;
}

export function DashboardSetBar(props: DashboardSetBarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DashboardDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardDefinition | null>(null);

  return (
    <>
      <div className="border-rule flex min-w-0 items-center gap-1 border-b pb-2">
        <nav
          aria-label="Dashboard sets"
          className="flex min-w-0 flex-1 scrollbar-none gap-1 overflow-x-auto"
        >
          {props.dashboards.map((dashboard) => {
            const active = dashboard.id === props.activeId;
            return (
              <button
                key={dashboard.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => props.onSelect(dashboard.id)}
                className={cn(
                  "focus-visible:ring-ring/50 h-8 shrink-0 rounded-full px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {dashboard.name}
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Add dashboard"
            onClick={() => setAddOpen(true)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 grid size-8 shrink-0 place-items-center rounded-full focus-visible:ring-3 focus-visible:outline-none"
          >
            <PlusIcon className="size-4" aria-hidden />
          </button>
        </nav>
      </div>

      <AddDashboardSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={props.onCreate}
      />
      <ManageDashboardsSheet
        open={props.manageOpen ?? false}
        onOpenChange={props.onManageOpenChange ?? (() => undefined)}
        dashboards={props.dashboards}
        defaultId={props.defaultId}
        onRename={setRenameTarget}
        onDuplicate={props.onDuplicate}
        onReorder={props.onReorder}
        onMakeDefault={props.onMakeDefault}
        onDelete={setDeleteTarget}
      />
      <RenameDashboardDialog
        key={renameTarget?.id ?? "no-rename"}
        dashboard={renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onRename={props.onRename}
      />
      <DeleteDashboardDialog
        dashboard={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDelete={props.onDelete}
      />
    </>
  );
}

export function DashboardOverflowMenu({
  onCustomize,
  onManage,
}: {
  onCustomize: () => void;
  onManage: () => void;
}) {
  return (
    <div role="group" aria-label="Dashboard options">
      <RowActions label="Dashboard options" className="rounded-full opacity-100">
        <DropdownMenuItem onSelect={onCustomize}>Customize dashboard</DropdownMenuItem>
        <DropdownMenuItem onSelect={onManage}>Manage dashboards</DropdownMenuItem>
      </RowActions>
    </div>
  );
}

function AddDashboardSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, starter: DashboardStarter) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [starter, setStarter] = useState<DashboardStarter>("planning");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate(name, starter);
      setName("");
      setStarter("planning");
      onOpenChange(false);
    } catch {
      // The shared dispatch handler reports the failure; retain the form for retry.
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add dashboard"
      description="Give this set a name and a useful starting point."
    >
      <form className="space-y-5 px-4 pb-5" onSubmit={(event) => void submit(event)}>
        <div className="space-y-2">
          <Label htmlFor="dashboard-name">Name</Label>
          <Input
            id="dashboard-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Quarterly planning"
            autoComplete="off"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
            Start with
          </legend>
          {STARTERS.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                starter === option.id
                  ? "border-foreground/30 bg-muted/45"
                  : "hover:bg-muted/25",
              )}
            >
              <input
                type="radio"
                name="dashboard-starter"
                value={option.id}
                checked={starter === option.id}
                onChange={() => setStarter(option.id)}
                className="accent-brand mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || saving}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </ResponsiveSheet>
  );
}

function ManageDashboardsSheet({
  open,
  onOpenChange,
  dashboards,
  defaultId,
  onRename,
  onDuplicate,
  onReorder,
  onMakeDefault,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboards: DashboardDefinition[];
  defaultId: string;
  onRename: (dashboard: DashboardDefinition) => void;
  onDuplicate: (id: string) => Promise<void>;
  onReorder: (activeId: string, overId: string) => Promise<void>;
  onMakeDefault: (id: string) => Promise<void>;
  onDelete: (dashboard: DashboardDefinition) => void;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Your dashboards"
      description="Rename, copy, order, or choose the default set."
    >
      <div className="space-y-2 px-4 pb-5">
        {dashboards.map((dashboard, index) => (
          <div
            key={dashboard.id}
            className="group bg-card flex min-h-14 items-center gap-2 rounded-xl border px-2 py-2"
          >
            <GripVerticalIcon
              className="text-muted-foreground/60 size-4 shrink-0"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{dashboard.name}</span>
                {dashboard.id === defaultId && (
                  <span className="text-brand text-[0.65rem] font-semibold tracking-wide uppercase">
                    Default
                  </span>
                )}
              </div>
              <span className="text-muted-foreground text-xs">
                {dashboard.instances.filter((instance) => !instance.hidden).length}{" "}
                widgets
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${dashboard.name} up`}
                disabled={index === 0}
                onClick={() => void onReorder(dashboard.id, dashboards[index - 1].id)}
              >
                <ArrowUpIcon aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${dashboard.name} down`}
                disabled={index === dashboards.length - 1}
                onClick={() => void onReorder(dashboard.id, dashboards[index + 1].id)}
              >
                <ArrowDownIcon aria-hidden />
              </Button>
              <RowActions label={`Actions for ${dashboard.name}`} className="opacity-100">
                <DropdownMenuLabel>{dashboard.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onRename(dashboard)}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onDuplicate(dashboard.id)}>
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={dashboard.id === defaultId}
                  onSelect={() => void onMakeDefault(dashboard.id)}
                >
                  <CheckIcon aria-hidden />
                  Make default
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={dashboards.length === 1}
                  onSelect={() => onDelete(dashboard)}
                >
                  Delete
                </DropdownMenuItem>
              </RowActions>
            </div>
          </div>
        ))}
      </div>
    </ResponsiveSheet>
  );
}

function RenameDashboardDialog({
  dashboard,
  onOpenChange,
  onRename,
}: {
  dashboard: DashboardDefinition | null;
  onOpenChange: (open: boolean) => void;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(dashboard?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!dashboard || !name.trim() || saving) return;
    setSaving(true);
    try {
      await onRename(dashboard.id, name);
      onOpenChange(false);
    } catch {
      // The shared dispatch handler reports the failure; retain the form for retry.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={dashboard !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="contents" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Rename dashboard</DialogTitle>
            <DialogDescription>
              Use a short name that fits in the dashboard tabs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-dashboard">Name</Label>
            <Input
              id="rename-dashboard"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDashboardDialog({
  dashboard,
  onOpenChange,
  onDelete,
}: {
  dashboard: DashboardDefinition | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <AlertDialog open={dashboard !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {dashboard?.name ?? "dashboard"}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its widget arrangement and settings will be removed. Other dashboards stay
            unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => dashboard && void onDelete(dashboard.id)}
          >
            Delete dashboard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
