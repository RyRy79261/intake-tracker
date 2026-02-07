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
import { type EatingRecord } from "@/lib/db";

interface EditEatingDialogProps {
  record: EatingRecord | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

export function EditEatingDialog({
  record,
  onClose,
  onSubmit,
  timestamp,
  onTimestampChange,
  note,
  onNoteChange,
  onFocus,
}: EditEatingDialogProps) {
  return (
    <Dialog open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Eating Entry</DialogTitle>
          <DialogDescription>Update the time or note</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-eating-timestamp">Time</Label>
            <Input
              id="edit-eating-timestamp"
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
              aria-required="true"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-eating-note">What I ate (optional)</Label>
            <Textarea
              id="edit-eating-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. Sandwich, apple"
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
