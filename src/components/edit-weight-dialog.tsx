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
import { type WeightRecord } from "@/lib/db";

interface EditWeightDialogProps {
  record: WeightRecord | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  weight: string;
  onWeightChange: (value: string) => void;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

export function EditWeightDialog({
  record,
  onClose,
  onSubmit,
  weight,
  onWeightChange,
  timestamp,
  onTimestampChange,
  note,
  onNoteChange,
  onFocus,
}: EditWeightDialogProps) {
  return (
    <Dialog open={record !== null} onOpenChange={(dialogOpen) => !dialogOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Weight Entry</DialogTitle>
          <DialogDescription>Update the weight, time, or note</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-weight">Weight (kg)</Label>
            <Input
              id="edit-weight"
              type="number"
              min="0.1"
              step="0.1"
              value={weight}
              onChange={(e) => onWeightChange(e.target.value)}
              onFocus={onFocus}
              className="text-lg h-12"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-weight-timestamp">Time</Label>
            <Input
              id="edit-weight-timestamp"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-weight-note">Note (optional)</Label>
            <Input
              id="edit-weight-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              onFocus={onFocus}
              placeholder="Add a note..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
