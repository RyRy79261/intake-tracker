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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type UrinationRecord } from "@/lib/db";

const AMOUNT_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

interface EditUrinationDialogProps {
  record: UrinationRecord | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

export function EditUrinationDialog({
  record,
  onClose,
  onSubmit,
  timestamp,
  onTimestampChange,
  amount,
  onAmountChange,
  note,
  onNoteChange,
  onFocus,
}: EditUrinationDialogProps) {
  return (
    <Dialog open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Urination Entry</DialogTitle>
          <DialogDescription>Update the time, amount estimate, or note</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-urination-timestamp">Time</Label>
            <Input
              id="edit-urination-timestamp"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
              aria-required="true"
            />
          </div>
          <div className="space-y-2">
            <Label>Amount (optional)</Label>
            <Select value={amount} onValueChange={onAmountChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select estimate" />
              </SelectTrigger>
              <SelectContent>
                {AMOUNT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-urination-note">Note (optional)</Label>
            <Textarea
              id="edit-urination-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. colour, urgency"
              className="min-h-[60px]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-violet-600 hover:bg-violet-700">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
