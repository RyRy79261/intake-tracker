"use client";

import { type FocusEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import type { DomainScope } from "@/lib/domain-colors";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { type IntakeRecord } from "@/lib/db";

interface EditIntakeDialogProps {
  record: IntakeRecord | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

export function EditIntakeDialog({
  record,
  onClose,
  onSubmit,
  amount,
  onAmountChange,
  timestamp,
  onTimestampChange,
  note,
  onNoteChange,
  onFocus,
}: EditIntakeDialogProps) {
  const typeLabel =
    record?.type === "water" ? "Water" : record?.type === "sugar" ? "Sugar" : "Sodium";
  const unit =
    record?.type === "water" ? "ml" : record?.type === "sugar" ? "g" : "mg";
  const amountDesc =
    record?.type === "water"
      ? "water amount in milliliters"
      : record?.type === "sugar"
        ? "sugar amount in grams"
        : "sodium amount in milligrams";
  // Potassium has no domain colour of its own; it stays ink (as in Metrics).
  const domain: DomainScope =
    record?.type === "water"
      ? "water"
      : record?.type === "sugar"
        ? "sugar"
        : record?.type === "potassium"
          ? "ink"
          : "sodium";
  return (
    <Dialog open={record !== null} onOpenChange={(dialogOpen) => !dialogOpen && onClose()}>
      <DialogContent className="sm:max-w-md" data-domain={domain}>
        <DialogHeader>
          <DialogTitle>Edit {typeLabel} Entry</DialogTitle>
          <DialogDescription>Update the amount, time, or note for this entry</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-amount">Amount ({unit})</Label>
            <Input
              id="edit-amount"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              onFocus={onFocus}
              className="text-lg h-12"
              autoFocus
              aria-required="true"
              aria-describedby="edit-amount-desc"
            />
            <p id="edit-amount-desc" className="sr-only">
              Enter the {amountDesc}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-timestamp">Time</Label>
            <Input
              id="edit-timestamp"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
              aria-required="true"
              aria-describedby="edit-timestamp-desc"
            />
            <p id="edit-timestamp-desc" className="sr-only">
              Select the date and time when this was recorded
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-intake-note">Note (optional)</Label>
            <Input
              id="edit-intake-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              onFocus={onFocus}
              placeholder="Add a note..."
              maxLength={200}
              aria-describedby="edit-note-desc"
            />
            <p id="edit-note-desc" className="sr-only">
              Optional note, maximum 200 characters
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
