"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface RetroactiveTimePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTime: string;
  compoundName: string;
  onConfirm: (time: string) => void;
}

export function RetroactiveTimePicker({
  open,
  onOpenChange,
  defaultTime,
  compoundName,
  onConfirm,
}: RetroactiveTimePickerProps) {
  const [selectedTime, setSelectedTime] = useState(defaultTime);

  // Reset time when dialog opens with new default
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setSelectedTime(defaultTime);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-center">
            When did you take {compoundName}?
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-background text-center text-lg"
          />
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(selectedTime);
              onOpenChange(false);
            }}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
          >
            Log Dose
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
