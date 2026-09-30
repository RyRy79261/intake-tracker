"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { cn } from "@/lib/utils";
import { bottomSheetClass } from "@/components/medications/sheet-classes";

const PRESET_REASONS = [
  "Forgot",
  "Side effects",
  "Ran out",
  "Doctor advised",
  "Don't need this dose",
];

interface SkipReasonPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (reason: string) => void;
  suggestRanOut?: boolean;
}

export function SkipReasonPicker({
  open,
  onOpenChange,
  onSelect,
  suggestRanOut,
}: SkipReasonPickerProps) {
  const [customReason, setCustomReason] = useState("");

  const handleSelect = (reason: string) => {
    onSelect(reason);
    onOpenChange(false);
    setCustomReason("");
  };

  const handleCustomSubmit = () => {
    if (customReason.trim()) {
      handleSelect(customReason.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-domain="meds" className={bottomSheetClass} aria-describedby={undefined}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-base font-semibold">Why are you skipping?</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {PRESET_REASONS.map((reason) => (
            <Button
              key={reason}
              variant="outline"
              className={cn(
                "h-auto min-h-11 whitespace-normal border-line px-2 text-center font-normal",
                suggestRanOut && reason === "Ran out" &&
                  "border-sodium shadow-[inset_0_0_0_1px_hsl(var(--sodium))]"
              )}
              onClick={() => handleSelect(reason)}
            >
              {reason}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Other reason..."
            aria-label="Other reason"
            value={customReason}
            className="h-11 bg-background"
            onChange={(e) => setCustomReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomSubmit();
            }}
          />
          <Button
            className="flex-none"
            disabled={!customReason.trim()}
            onClick={handleCustomSubmit}
          >
            Submit
          </Button>
        </div>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
