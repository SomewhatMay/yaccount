"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A checkbox and its words. SIBLINGS tied by id, never a label wrapped around
 * the control: Radix renders a <button>, and a label containing its own control
 * leaves "did this click toggle once or twice" to the browser (the FilterBar
 * facet rows follow the same rule).
 */
export function CheckboxField({
  checked,
  onCheckedChange,
  className,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {children}
      </Label>
    </div>
  );
}
