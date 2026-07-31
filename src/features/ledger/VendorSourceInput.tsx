"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";

export function VendorSourceInput({
  suggestions,
  ...props
}: React.ComponentProps<typeof Input> & { suggestions: string[] }) {
  const listId = useId();

  return (
    <>
      <Input {...props} list={suggestions.length > 0 ? listId : undefined} />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((value) => (
            <option key={value.toLocaleLowerCase()} value={value} />
          ))}
        </datalist>
      )}
    </>
  );
}
