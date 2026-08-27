"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import { rankAutocompleteOptions } from "@/core/engine/autocomplete";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CreationComboboxOption {
  value: string;
  label: string;
  detail?: string;
  leading?: React.ReactNode;
}

type InputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "onSelect"
>;

function Combobox({
  inputValue,
  options,
  selectedValue,
  onInputValueChange,
  onSelect,
  onCommitInput,
  onCancelInput,
  className,
  ...props
}: InputProps & {
  inputValue: string;
  options: CreationComboboxOption[];
  selectedValue?: string;
  onInputValueChange: (value: string) => void;
  onSelect: (option: CreationComboboxOption) => void;
  onCommitInput?: (value: string) => void;
  onCancelInput?: () => void;
}) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const expanded = open && options.length > 0;

  useEffect(() => {
    if (expanded) listRef.current?.scrollIntoView({ block: "nearest" });
  }, [expanded]);

  function choose(option: CreationComboboxOption) {
    onSelect(option);
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        onCommitInput?.(inputValue);
        onCancelInput?.();
        setOpen(false);
        setActiveIndex(-1);
      }}
    >
      <Input
        {...props}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={expanded}
        aria-activedescendant={
          expanded && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        autoComplete="off"
        value={inputValue}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          onInputValueChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (options.length === 0) return;
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => {
              if (event.key === "ArrowDown") return (current + 1) % options.length;
              return current <= 0 ? options.length - 1 : current - 1;
            });
          } else if (event.key === "Enter" && expanded && activeIndex >= 0) {
            event.preventDefault();
            choose(options[activeIndex]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
        className={className}
      />
      {expanded && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ WebkitOverflowScrolling: "touch" }}
          className="border-input bg-popover text-popover-foreground mt-1 max-h-52 touch-pan-y overflow-y-auto overscroll-contain rounded-lg border p-1 shadow-md sm:max-h-[20.5rem]"
        >
          {options.map((option, index) => (
            <li
              id={`${listId}-option-${index}`}
              key={option.value}
              role="option"
              aria-selected={option.value === selectedValue}
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                "hover:bg-muted flex min-h-10 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                activeIndex === index && "bg-muted",
              )}
            >
              {option.leading}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.detail && (
                <span className="text-muted-foreground text-xs">{option.detail}</span>
              )}
              {option.value === selectedValue && (
                <CheckIcon className="text-primary size-4" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CreationTextCombobox({
  value,
  suggestions,
  onValueChange,
  onMatch,
  ...props
}: InputProps & {
  value: string;
  suggestions: string[];
  onValueChange: (value: string) => void;
  onMatch: (value: string) => void;
}) {
  const options = suggestions.map((suggestion) => ({
    value: suggestion.toLocaleLowerCase(),
    label: suggestion,
  }));

  return (
    <Combobox
      {...props}
      inputValue={value}
      options={options}
      onInputValueChange={onValueChange}
      onSelect={(option) => {
        onValueChange(option.label);
        onMatch(option.label);
      }}
      onCommitInput={onMatch}
    />
  );
}

export function CreationEntityCombobox({
  value,
  options,
  onValueChange,
  ...props
}: InputProps & {
  value: string;
  options: CreationComboboxOption[];
  onValueChange: (value: string) => void;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";

  return (
    <CreationEntityComboboxState
      key={`${value}:${selectedLabel}`}
      {...props}
      value={value}
      options={options}
      selectedLabel={selectedLabel}
      onValueChange={onValueChange}
    />
  );
}

function CreationEntityComboboxState({
  value,
  options,
  selectedLabel,
  onValueChange,
  ...props
}: InputProps & {
  value: string;
  options: CreationComboboxOption[];
  selectedLabel: string;
  onValueChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(selectedLabel);
  const [searching, setSearching] = useState(false);
  const ranked = useMemo(
    () => rankAutocompleteOptions(options, searching ? query : ""),
    [options, query, searching],
  );

  return (
    <Combobox
      {...props}
      inputValue={query}
      options={ranked}
      selectedValue={value}
      onInputValueChange={(next) => {
        setQuery(next);
        setSearching(true);
      }}
      onSelect={(option) => {
        onValueChange(option.value);
        setQuery(option.label);
        setSearching(false);
      }}
      onCancelInput={() => {
        setQuery(selectedLabel);
        setSearching(false);
      }}
    />
  );
}
