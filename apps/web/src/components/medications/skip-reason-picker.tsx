"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Why are you skipping?</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {PRESET_REASONS.map((reason) => (
            <Button
              key={reason}
              variant="outline"
              className={cn(
                "w-full justify-start text-left",
                suggestRanOut && reason === "Ran out" &&
                  "ring-2 ring-amber-400 dark:ring-amber-500"
              )}
              onClick={() => handleSelect(reason)}
            >
              {reason}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 mt-2">
          <Input
            placeholder="Other reason..."
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomSubmit();
            }}
          />
          <Button
            size="sm"
            disabled={!customReason.trim()}
            onClick={handleCustomSubmit}
          >
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
