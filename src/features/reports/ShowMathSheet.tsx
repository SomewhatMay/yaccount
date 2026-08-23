"use client";

import { ResponsiveSheet } from "@/features/ui";
import { Money } from "@/features/ui/Money";
import type { WidgetMathDisclosure, WidgetMathLine } from "./registry";

const GROUPS: { kind: WidgetMathLine["kind"]; label: string }[] = [
  { kind: "actual", label: "Actual" },
  { kind: "scheduled", label: "Scheduled" },
  { kind: "inferred", label: "Inferred" },
  { kind: "context", label: "Other inputs" },
];

export function ShowMathSheet({
  open,
  onOpenChange,
  title,
  idPrefix,
  disclosure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  idPrefix: string;
  disclosure: WidgetMathDisclosure;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${title}: show the math`}
      description={disclosure.range}
    >
      <div className="space-y-5 px-4 pb-5">
        {GROUPS.map((group) => {
          const lines = disclosure.lines.filter((line) => line.kind === group.kind);
          if (lines.length === 0) return null;
          return (
            <section key={group.kind} aria-labelledby={`math-${idPrefix}-${group.kind}`}>
              <h3
                id={`math-${idPrefix}-${group.kind}`}
                className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.14em] uppercase"
              >
                {group.label}
              </h3>
              <dl className="divide-rule divide-y border-y">
                {lines.map((line, index) => (
                  <div
                    key={`${line.label}-${index}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2.5 text-sm"
                  >
                    <dt>{line.label}</dt>
                    <dd className="font-medium">
                      {line.amount === undefined ? (
                        (line.value ?? "—")
                      ) : (
                        <Money cents={line.amount} />
                      )}
                    </dd>
                    {line.note && (
                      <dd className="text-muted-foreground col-span-2 mt-0.5 text-xs">
                        {line.note}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>
          );
        })}

        <section className="space-y-2 text-sm">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
            Data notes
          </h3>
          <p>
            <span className="font-medium">Freshness:</span> {disclosure.freshness}
          </p>
          <p>
            <span className="font-medium">Rule:</span> {disclosure.rule}
          </p>
          <div>
            <span className="font-medium">Excluded:</span>{" "}
            {disclosure.exclusions.length > 0
              ? disclosure.exclusions.join("; ")
              : "Nothing"}
          </div>
        </section>
      </div>
    </ResponsiveSheet>
  );
}
