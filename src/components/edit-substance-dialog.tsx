"use client";

import { type FocusEvent } from "react";
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
import { CARD_THEMES } from "@/lib/card-themes";
import { type SubstanceRecord } from "@/lib/db";

interface EditSubstanceDialogProps {
  record: SubstanceRecord | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

export function EditSubstanceDialog({
  record,
  onClose,
  onSubmit,
  timestamp,
  onTimestampChange,
  description,
  onDescriptionChange,
  amount,
  onAmountChange,
  onFocus,
}: EditSubstanceDialogProps) {
  const isCaffeine = record?.type === "caffeine";
  const theme = CARD_THEMES[isCaffeine ? "caffeine" : "alcohol"];
  const amountLabel = isCaffeine ? "Caffeine (mg)" : "Standard drinks";
  const amountStep = isCaffeine ? "1" : "0.1";

  return (
    <Dialog open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {isCaffeine ? "Caffeine" : "Alcohol"} Entry
          </DialogTitle>
          <DialogDescription>
            Update the time, description, or amount
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-substance-timestamp">Time</Label>
            <Input
              id="edit-substance-timestamp"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
              aria-required="true"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-substance-description">Description</Label>
            <Input
              id="edit-substance-description"
              type="text"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              onFocus={onFocus}
              placeholder={isCaffeine ? "e.g. Flat white" : "e.g. Glass of red wine"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-substance-amount">{amountLabel}</Label>
            <Input
              id="edit-substance-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step={amountStep}
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              onFocus={onFocus}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className={theme.buttonBg}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
