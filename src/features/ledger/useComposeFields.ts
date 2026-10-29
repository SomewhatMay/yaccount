"use client";

import { useMemo, useState } from "react";
import { useSetAtom } from "jotai";
import type { Category, Container, DistributionPreset, Transaction } from "@/core/model";
import {
  recallDistribution,
  splitIncome,
  usablePreset,
} from "@/core/engine/distribution";
import { parseDollars } from "@/core/money";
import { linesFromSplit } from "@/features/distribution/lines";
import {
  sortContainersAlphabetically,
  sortCategoriesAlphabetically,
} from "@/core/engine/usage-ranking";
import {
  rankVendorSourcesForKind,
  recallVendorSelection,
} from "@/core/engine/autocomplete";
import { dispatchManyAtom, flashRowAtom } from "@/features/store";
import { instantFromNow, nowDateTimeInput, splitDateTime } from "@/features/clock";
import { composeOp } from "@/features/ledger/compose";
import { defaultSign, splitSign, type Sign } from "@/features/ledger/amount";

/**
 * The state behind both writing surfaces — the inline compose bar and the
 * quick-add sheet. `compose.ts` holds the pure "does this draft make a
 * transaction" rule; this holds the fields, the arming of a soft warning and the
 * write itself, so the two surfaces can differ in layout and in nothing else.
 *
 * They do differ in layout: the bar is one line of borderless inputs above the
 * register (§12.4), the sheet is a thumb-sized form that rises from the FAB
 * (§12.5). Neither knows how the other is built.
 */
export type ComposeKind = "expense" | "income" | "transfer";

export function useComposeFields({
  categories,
  containers,
  transactions,
  defaultContainerId,
  presets = [],
  defaultDistributionId = null,
  initialKind = "expense",
  onLogged,
}: {
  categories: Category[];
  containers: Container[];
  transactions: Transaction[];
  defaultContainerId: string;
  /** Income-distribution presets (plans/income-distribution.md), archived
   * included — only the usable ones are offered. */
  presets?: DistributionPreset[];
  defaultDistributionId?: string | null;
  /** What the surface opens on. The bar starts on an expense; the sheet starts
   * on whatever asked it to open. */
  initialKind?: ComposeKind;
  /** Fired after a row is written — the sheet closes itself, the bar stays put. */
  onLogged?: () => void;
}) {
  const dispatchMany = useSetAtom(dispatchManyAtom);
  const flashRow = useSetAtom(flashRowAtom);

  const activeCategories = useMemo(
    () => sortCategoriesAlphabetically(categories.filter((c) => !c.is_archived)),
    [categories],
  );
  const activeContainers = useMemo(
    () => sortContainersAlphabetically(containers.filter((c) => !c.is_archived)),
    [containers],
  );
  const [kind, setKindState] = useState<ComposeKind>(initialKind);
  // One control for "when" — date and time together. Untouched, the row takes the
  // op's timestamp (full precision, so a burst of entries never ties); once the
  // user picks a time, theirs wins.
  const [when, setWhen] = useState(() => nowDateTimeInput());
  const [whenPicked, setWhenPicked] = useState(false);
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [amountStr, setAmountStr] = useState("");
  // "" = follow the first category of this kind; a pick overrides it. Same shape
  // as the container below, and it means the fields survive an empty first
  // render (the sheet is mounted by the shell, before the tables have loaded).
  const [pickedCategoryId, setPickedCategoryId] = useState("");
  // Null = "follow the Default Spending Container" (§5.2); a pick overrides it.
  const [pickedContainerId, setPickedContainerId] = useState<string | null>(null);
  const [toContainerId, setToContainerId] = useState("");
  // Null = follow the category's usual direction; a tap (or a typed +/−) pins it.
  const [pickedSign, setPickedSign] = useState<Sign | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Distribute: undefined = follow what this category's last income did (or the
  // default preset); null = the user unticked it; an id = the preset they picked.
  const [pickedDistribution, setPickedDistribution] = useState<string | null | undefined>(
    undefined,
  );

  const { date, time } = splitDateTime(when);
  const categoriesOfKind = useMemo(
    () => (kind === "transfer" ? [] : activeCategories.filter((c) => c.type === kind)),
    [activeCategories, kind],
  );
  const category =
    activeCategories.find((c) => c.id === pickedCategoryId) ?? categoriesOfKind[0];
  const containerId = pickedContainerId ?? defaultContainerId;
  const from = containers.find((c) => c.id === containerId);
  const to = containers.find((c) => c.id === toContainerId);
  const type = category?.type ?? (kind === "income" ? "income" : "expense");
  const sign: Sign = pickedSign ?? defaultSign(type);
  const usablePresets = useMemo(
    () => presets.filter((p) => usablePreset(p.id, presets, containers) !== null),
    [presets, containers],
  );
  // Only money in on an income category can be split.
  const canDistribute =
    kind === "income" &&
    category?.type === "income" &&
    sign === "+" &&
    usablePresets.length > 0;
  const recalledDistribution = useMemo(
    () =>
      category && category.type === "income"
        ? recallDistribution(
            transactions,
            category.id,
            presets,
            containers,
            defaultDistributionId,
          )
        : null,
    [category, transactions, presets, containers, defaultDistributionId],
  );
  const distributionId = canDistribute
    ? (usablePreset(
        pickedDistribution === undefined ? recalledDistribution : pickedDistribution,
        presets,
        containers,
      )?.id ?? null)
    : null;
  const distributionPreset = distributionId
    ? (presets.find((p) => p.id === distributionId) ?? null)
    : null;
  const distributionPreview = useMemo(() => {
    if (!distributionPreset) return null;
    let cents: number;
    try {
      cents = Math.abs(parseDollars(amountStr));
    } catch {
      return null;
    }
    const split = splitIncome(cents, distributionPreset, containers);
    if (!split.ok) return null;
    return { total: cents, ...linesFromSplit(split, distributionPreset, containers) };
  }, [distributionPreset, amountStr, containers]);

  function setDistribute(on: boolean) {
    setError("");
    setPickedDistribution(
      on
        ? (recalledDistribution ?? defaultDistributionId ?? usablePresets[0]?.id ?? null)
        : null,
    );
  }

  const vendorSources = useMemo(
    () => rankVendorSourcesForKind(transactions, categories, kind, vendor),
    [categories, kind, transactions, vendor],
  );

  function recallVendor(value: string) {
    const recalled = recallVendorSelection(transactions, categories, kind, value);
    if (!recalled) return;
    if (categoriesOfKind.some((candidate) => candidate.id === recalled.categoryId)) {
      setPickedCategoryId(recalled.categoryId);
      setPickedDistribution(undefined);
    }
    if (activeContainers.some((candidate) => candidate.id === recalled.containerId)) {
      setPickedContainerId(recalled.containerId);
    }
  }

  /** Switching kind is a deliberate "I'm logging something else now": drop a
   * pinned sign, and drop a category that no longer belongs to this kind. */
  function setKind(next: ComposeKind) {
    setKindState(next);
    setPickedSign(null);
    setWarn(null);
    setError("");
    if (next !== "transfer" && category && category.type !== next)
      setPickedCategoryId("");
  }

  /** Picking a category can move the kind with it — on the compose bar the kind
   * is not a control, it is whatever you chose to file this under. */
  function setCategoryId(id: string) {
    setPickedCategoryId(id);
    // A different category has its own habit — follow it again.
    setPickedDistribution(undefined);
    setWarn(null);
    setError("");
    const picked = activeCategories.find((c) => c.id === id);
    if (picked && picked.type !== kind) setKindState(picked.type);
  }

  // A typed leading +/− moves into the sign control so it is never a silent no-op.
  function onAmountChange(raw: string) {
    const { sign: typed, rest } = splitSign(raw);
    if (typed) setPickedSign(typed);
    setAmountStr(rest);
    setWarn(null);
    setError("");
  }

  function reset() {
    setVendor("");
    setNotes("");
    setAmountStr("");
    setPickedSign(null);
    setPickedDistribution(undefined);
    setWarn(null);
    setError("");
    // Roll "when" forward to now for the next entry, unless the user deliberately
    // set one — logging several things for the same past evening shouldn't make
    // them re-pick it every time.
    if (!whenPicked) setWhen(nowDateTimeInput());
  }

  async function submit() {
    setError("");
    const entered_at = whenPicked ? (instantFromNow(date, time) ?? undefined) : undefined;
    const outcome = composeOp(
      kind === "transfer"
        ? { kind: "transfer", date, entered_at, vendor, notes, amountStr, from, to }
        : {
            kind: "entry",
            date,
            entered_at,
            vendor,
            notes,
            amountStr,
            sign,
            category,
            from,
            distribution: distributionPreset
              ? { preset: distributionPreset, containers }
              : undefined,
          },
      // A soft warning is armed once and committed by the next submit (§10 #13).
      { confirmed: warn !== null },
    );

    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    if (outcome.status === "confirm") {
      setWarn(outcome.message);
      return;
    }

    try {
      await dispatchMany(outcome.ops);
    } catch {
      // `dispatchAtom` has already logged and shown this. Skipping the success
      // path is the point: the form keeps what was typed and no "Logged" toast
      // fires for a row that was never written.
      return;
    }
    // §12.5's one orchestrated moment ends here: the row lands in the register
    // carrying a single iris wash.
    flashRow({ id: outcome.row.id });
    reset();
    onLogged?.();
  }

  return {
    kind,
    setKind,
    activeCategories,
    categoriesOfKind,
    activeContainers,
    category,
    categoryId: category?.id ?? "",
    setCategoryId,
    containerId,
    setPickedContainerId,
    toContainerId,
    setToContainerId,
    when,
    setWhen: (value: string) => {
      setWhen(value);
      setWhenPicked(true);
    },
    vendor,
    setVendor,
    recallVendor,
    vendorSources,
    notes,
    setNotes,
    amountStr,
    onAmountChange,
    sign,
    setSign: (next: Sign) => {
      setPickedSign(next);
      setWarn(null);
    },
    canDistribute,
    usablePresets,
    distributionId,
    distributionPreset,
    distributionPreview,
    setDistribute,
    setDistributionId: (id: string) => {
      setPickedDistribution(id);
      setError("");
    },
    warn,
    error,
    submit,
  };
}
