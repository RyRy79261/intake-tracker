"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Switch } from "@intake/ui/switch";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";

/** The skip reasons, in Medisafe's order, in our words. "Other" opens a text box. */
export const SKIP_REASONS = [
  "Med is not near me",
  "Forgot / busy / asleep",
  "Ran out of the med",
  "Do not need this dose",
  "Side effects / health concerns",
  "Cost",
  "Doctor advised",
] as const;

const RAN_OUT = "Ran out of the med";

interface SkipReasonPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (reason: string) => void;
  /** Highlight "Ran out of the med": stock is below one dose, or there is none. */
  suggestRanOut?: boolean;
}

/**
 * "Why are you skipping this dose?". The skip is already written when this
 * opens, so dismissing it leaves the dose skipped with no reason. The
 * "Ask me every time" switch turns the question off.
 */
export function SkipReasonPicker({
  open,
  onOpenChange,
  onSelect,
  suggestRanOut,
}: SkipReasonPickerProps) {
  const [other, setOther] = useState(false);
  const [customReason, setCustomReason] = useState("");
  const askSkipReason = useSettingsStore((s) => s.askSkipReason);
  const setAskSkipReason = useSettingsStore((s) => s.setAskSkipReason);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOther(false);
      setCustomReason("");
    }
  }

  const handleSelect = (reason: string) => {
    onSelect(reason);
    onOpenChange(false);
  };

  const submitOther = () => {
    if (customReason.trim()) handleSelect(customReason.trim());
  };

  return (
    // A drawer, so it stacks over the dose dialog and the modal (drawers too).
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-domain="meds" className="bg-panel md:mx-auto md:w-full md:max-w-lg" aria-describedby={undefined}>
        <div className="grid gap-3 px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
          <DrawerTitle className="text-base font-semibold">Why are you skipping this dose?</DrawerTitle>

          <div className="grid grid-cols-2 gap-2">
            {SKIP_REASONS.map((reason) => (
              <Button
                key={reason}
                variant="outline"
                className={cn(
                  "h-auto min-h-11 whitespace-normal border-line px-2 text-center font-normal",
                  suggestRanOut && reason === RAN_OUT &&
                    "border-sodium shadow-[inset_0_0_0_1px_hsl(var(--sodium))]"
                )}
                onClick={() => handleSelect(reason)}
              >
                {reason}
              </Button>
            ))}
            <Button
              variant="outline"
              aria-expanded={other}
              className="h-auto min-h-11 whitespace-normal border-line px-2 text-center font-normal"
              onClick={() => setOther(true)}
            >
              Other
            </Button>
          </div>

          {other && (
            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="Your reason"
                aria-label="Other reason"
                value={customReason}
                className="h-11 bg-background"
                onChange={(e) => setCustomReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitOther();
                }}
              />
              <Button className="flex-none" disabled={!customReason.trim()} onClick={submitOther}>
                Save
              </Button>
            </div>
          )}

          <label className="flex min-h-11 items-center justify-between gap-2 text-[0.9375rem]">
            Ask me every time
            <Switch checked={askSkipReason} onCheckedChange={setAskSkipReason} aria-label="Ask me every time" />
          </label>

          <Button variant="outline" onClick={() => onOpenChange(false)}>
            No reason
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
