"use client";

/**
 * Searchable multi-select for an entry's body places, built like the country
 * picker in components/settings/medication-prefs-section.tsx (Popover +
 * Command). Places come from @intake/core/journal.
 */
import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@intake/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@intake/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@intake/ui/command";
import { PLACE_GROUPS, PLACE_OPTIONS, basePlace, placeLabel } from "@intake/core/journal";
import { cn } from "@/lib/utils";

export function BodyPlaceCombobox({
  value,
  onChange,
  disabled,
  id,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean | undefined;
  id?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (placeId: string) => {
    if (value.includes(placeId)) {
      onChange(value.filter((v) => v !== placeId));
      return;
    }
    // Picking "Knee, left" settles a "knee" the voice parser heard without a side.
    onChange([...value.filter((v) => v !== basePlace(placeId)), placeId]);
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-10 w-full justify-between px-3 font-normal"
          >
            <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
              {value.length === 0 ? "Not tied to a body place" : value.map(placeLabel).join("; ")}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search: knee, armpit, eyes…" />
            <CommandList>
              <CommandEmpty>No body place found.</CommandEmpty>
              {PLACE_GROUPS.map((group) => (
                <CommandGroup key={group} heading={group}>
                  {PLACE_OPTIONS.filter((o) => o.group === group).map((o) => (
                    <CommandItem key={o.id} value={o.label} onSelect={() => toggle(o.id)}>
                      <Check className={cn("mr-2 h-4 w-4", value.includes(o.id) ? "opacity-100" : "opacity-0")} />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => toggle(v)}
              className="inline-flex h-7 items-center gap-1 border border-line px-2 text-xs hover:bg-foreground/6"
              aria-label={`Remove ${placeLabel(v)}`}
            >
              {placeLabel(v)}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
