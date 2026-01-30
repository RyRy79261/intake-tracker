"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ManualInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "water" | "salt";
  currentValue: number;
  onSubmit: (amount: number) => Promise<void>;
  isSubmitting?: boolean;
}

export function ManualInputDialog({
  open,
  onOpenChange,
  type,
  currentValue,
  onSubmit,
  isSubmitting = false,
}: ManualInputDialogProps) {
  const [value, setValue] = useState(currentValue.toString());

  const isWater = type === "water";
  const unit = isWater ? "ml" : "mg";

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue(currentValue.toString());
    }
  }, [open, currentValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(value, 10);
    if (isNaN(amount) || amount <= 0) return;
    await onSubmit(amount);
  };

  const quickValues = isWater
    ? [100, 250, 500, 750, 1000]
    : [100, 250, 500, 750, 1000];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Enter {isWater ? "Water" : "Salt"} Amount
          </DialogTitle>
          <DialogDescription>
            Enter the exact amount in {unit} to add to your intake.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ({unit})</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Enter amount in ${unit}`}
              className="text-lg h-12"
              autoFocus
            />
          </div>

          {/* Quick value buttons */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Quick select</Label>
            <div className="flex flex-wrap gap-2">
              {quickValues.map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue(v.toString())}
                  className={cn(
                    "transition-all",
                    value === v.toString() &&
                      (isWater
                        ? "bg-sky-100 border-sky-300 dark:bg-sky-900/50"
                        : "bg-amber-100 border-amber-300 dark:bg-amber-900/50")
                  )}
                >
                  {v}
                  {unit}
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !value || parseInt(value, 10) <= 0}
              className={cn(
                isWater
                  ? "bg-sky-600 hover:bg-sky-700"
                  : "bg-amber-600 hover:bg-amber-700"
              )}
            >
              {isSubmitting ? "Adding..." : "Add Entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
