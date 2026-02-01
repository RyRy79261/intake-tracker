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
import { cn } from "@/lib/utils";
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
  return (
    <Dialog open={record !== null} onOpenChange={(dialogOpen) => !dialogOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {record?.type === "water" ? "Water" : "Salt"} Entry</DialogTitle>
          <DialogDescription>Update the amount, time, or note for this entry</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-amount">Amount ({record?.type === "water" ? "ml" : "mg"})</Label>
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-timestamp">Time</Label>
            <Input
              id="edit-timestamp"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
            />
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
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className={cn(
                record?.type === "water" ? "bg-sky-600 hover:bg-sky-700" : "bg-amber-600 hover:bg-amber-700"
              )}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
