# Income distribution

Status: approved 2026-10-29.

Split an income entry across containers by a named, percent-based preset. The
user decides every dollar's purpose once, in Plan, and each paycheck then lands
where it belongs without three manual transfers.

## Decisions (from the design discussion)

| Topic | Decision |
| --- | --- |
| Rule shape | Percent only. |
| 100% / cents | Every part but one is typed. One pinned **rest** container takes `100 − Σ` and every leftover cent. Can never be invalid; over 100% is flagged in rose and blocks Save. Decimal % stored as integer basis points (1% = 100 bps). |
| Storage | **1 income row + N linked transfers**, written in one `dispatchMany`. Income lands in the rest container; each part is a transfer `rest → part`. Goal progress moves (progress = transfers in, §4.6). |
| Presets | Named presets, one setting key each. Archived, never removed (settings have no remove op), with Restore. One default preset. |
| Plan tab | "Distributions" card under the allocation card. Each preset is a register row with a thin segmented bar. Tap → Sheet editor with live preview on this month's expected income (editable). |
| Compose | `Distribute` checkbox beside Category. On → the Container select becomes a preset select; a small label under the figure ("distributing via Paycheck ⓘ"); ⓘ opens the cents breakdown. |
| Checkbox default | Recalled per income category from the ledger: the last live income in that category decides. No history → default preset if one exists. No new setting. |
| Ledger row | One row at the gross amount. Sub-line `Category · split N ways ⓘ · time`. Transfers hidden. |
| Ledger filtered | When a filter/search matches through a piece, the parent row shows its split inline with the matching line(s) highlighted. If the container filter matches the rest container, the rest line is highlighted. A split of more than three lines condenses to the first line, the match(es) and `… N more splits`; the row keeps its ⓘ for the full split. |
| Edit | Amount, preset or Distribute changes re-split at the preset's **current** % in one batch. Payee/date/notes edits keep the pieces' amounts and carry date/payee to them. Untick → pieces voided (reversible). **Outdated split** (its preset would split it differently today): the sheet says so with an **Update to current shares** button; until pressed the entry keeps its own shares and an amount change scales them (`floor(piece × new ÷ old)`, rest takes the cents). |
| Delete | Voids parent + every live piece in one batch; Undo un-voids all of them. |
| Recurring | Income rules can pick a preset. Generated pending rows carry it; **Approve** writes the pieces (split computed at approve, at the approved amount). |
| Shortcuts | Saving a distributed income as a shortcut keeps its preset; quick-logging it splits. |

### Edge cases (approved defaults)

1. Shortcuts keep their preset.
2. A part whose container is archived folds into rest at write time; the label says so (`Invest archived → rest`). Flagged, never blocked.
3. A preset whose **rest** container is archived is unusable: compose falls back to unticked + Container select; the Plan sheet blocks Save until a new rest is chosen.
4. An archived (or missing) preset: recall / rules / shortcuts fall back to unticked + their container; the rule row warns.
5. A part that floors to 0¢ writes no transfer. Rest may be 0% (it still takes rounding cents).
6. Distribute is offered only for money in on an income category. Clawbacks go to one container.
7. Older clients see the pieces as ordinary transfers labelled with the payee. Balances and goals are identical everywhere.
8. Reports: income reports see one income row. Container Flows shows the transfers. Goal progress moves.

Extras (no cut scope):

- **Fill from goal asks** in the preset sheet seeds each active goal's container with `ask ÷ expected income` %.
- **Overlap hint**: a part container that also receives an active recurring transfer shows `also gets $X from "Rule"`.

## Storage contract (checked against the op-log + sync engine)

Read before touching this: `src/core/oplog/apply.ts`, `src/core/repo/repo.ts`, `src/sync/*`, spec §1.1, §5.

- **No new op types.** Older clients drop unknown op types, which would make
  devices disagree. Everything here is `transaction.create|update|void|approve`,
  `template.create`, `recurringRule.create|update` and `setting.set`.
- **The split is frozen at write time.** Pieces carry exact cents. Nothing
  re-derives a split at replay or view time, so editing a preset never rewrites
  history and replay stays deterministic.
- **Every row stands alone.** The link is metadata (and a piece is also
  recognised by its deterministic id, so an older client that re-parses a piece
  and strips the link field doesn't orphan it). A partially synced group, a
  group whose rows drifted under concurrent full-row LWW edits, a parent voided
  by an older client — all keep balances exact (but see the known limit below). Display rules degrade:
  - a piece is hidden only while its parent is live; otherwise it renders as an
    ordinary transfer;
  - a parent is "split" only while it has ≥1 live piece;
  - the ⓘ breakdown always reads the actual rows (% = piece ÷ gross), never the
    preset.
- **Deterministic piece ids at creation**: `<parentId>:split:<containerId>`.
  Two devices approving the same generated pending row (whose id is already
  deterministic, §6.6) converge on the same pieces instead of doubling them. A
  re-split that needs a piece id already used by an earlier (voided) piece mints
  a fresh id instead, so a reversal never lands on a reused id.
- **New fields default to null** so pre-feature journals, imports and snapshots
  still validate (`recurring_occurrence_date` precedent):
  - `transactions.distribution_preset_id` — on the income (parent) row and on
    an income template / pending occurrence: which preset split it.
  - `transactions.distribution_parent_id` — on each piece → the parent's id.
  - `recurring_rules.template_distribution_preset_id` — the rule's preset.
  - Schema refinements: a parent id only on transfers; a preset id only on
    category rows.
- **Presets** live in settings, one key per preset: `distribution:<id>` →
  JSON `{v:1, id, name, rest_container_id, parts:[{container_id, bps}], archived}`.
  Per-preset LWW, so editing two presets on two devices never collides.
  Default: `distribution_default` → preset id (`""` = none). Malformed JSON is
  ignored, never thrown on (a merge must never throw).

### Known limit (pre-existing, every row type)

A void snapshots the amount it reverses. If device A edits a row's amount while
device B (offline) deletes it — or both delete it offline — the merged reversal
doesn't net to zero and hidden money remains. Re-splits update pieces in place,
which makes this slightly easier to hit. Fixing it means changing void semantics
app-wide (derive a reversal's effect from the reversed row's current amount, or
dedupe reversers per `reverses_id`), so it's flagged for a follow-up rather than
patched here.

## Cents math

```
piece_i = floor(amount × bps_i / 10000)        (BigInt — no float, no overflow)
rest    = amount − Σ piece_i                    (≥ 0 since Σ bps ≤ 10000)
```

Parts at an archived container contribute 0 and their bps fold into rest.
Zero pieces are dropped. Σ pieces + rest = amount exactly, always.

## Tasks (TDD — test first, each)

Core

1. `model/transaction`: two nullable fields with defaults + refinements; factories accept them; `makeVoidRow` keeps them.
2. `model/recurringRule`: `template_distribution_preset_id`; generator copies it onto income occurrences.
3. `model/distribution`: preset schema, parse (tolerant), serialize, setting keys.
4. `engine/distribution`: `splitIncome`, `listPresets`, `defaultPreset`, `presetIssues`, `recallDistribution`, `distributionGroups` / `pieceOf` / `hideDistributionPieces`, `groupBreakdown`, `fillFromGoalAsks`, `recurringOverlap`.
5. `commands`: `createDistributedIncome`, `approveDistributed`, `resplitDistribution` (reconcile update/create/void), `voidDistribution`, `unvoidDistribution`, `logTemplateOps`, preset `setDistributionPreset` / archive / restore / default.
6. Export validation round-trip with the new fields; replay convergence for double approve.

Features

7. `compose.ts`: draft distribution → `ops[]`.
8. QuickAddSheet: checkbox, preset select, label + ⓘ popover, recall default, shortcuts.
9. Plan: Distributions card, preset Sheet editor, archived section, fill from asks, overlap hint.
10. Ledger: compact split row + ⓘ, inline split when filtered, group delete/undo, deep-link/⌘K map a piece to its parent, dashboard recent hides pieces, autocomplete/usage ignore pieces.
11. EditTransactionSheet: Distribute + preset, re-split on save.
12. Inbox: label, approve/bulk approve write pieces, edit-before-approve.
13. RecurringRuleSheet: Distribute + preset for income rules.
14. e2e: preset CRUD, compose split, ledger ⓘ, filter highlight, edit re-split, delete/undo, recurring approve, shortcut.
