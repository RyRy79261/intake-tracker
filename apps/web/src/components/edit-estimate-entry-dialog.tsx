"use client";

import { type FocusEvent, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import { CARD_THEMES } from "@/lib/card-themes";
import { ESTIMATE_TRACKERS, type EstimateTrackerId } from "@/lib/estimate-trackers";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Textarea } from "@intake/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { NO_ESTIMATE_VALUE as NONE_VALUE } from "@intake/core/record-schemas";

export interface EditEstimateEntryDialogProps {
  /** Which tracker the entry belongs to: title, options, placeholder, colour and ids follow it. */
  tracker: EstimateTrackerId;
  /** Whether the dialog is open (typically `record !== null`). */
  open: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  timestamp: string;
  onTimestampChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

/**
 * Edit dialog for an estimate-tracker entry (urination, defecation): time,
 * optional amount estimate ("No estimate" maps to "") and note.
 */
export function EditEstimateEntryDialog({
  tracker,
  open,
  onClose,
  onSubmit,
  timestamp,
  onTimestampChange,
  amount,
  onAmountChange,
  note,
  onNoteChange,
  onFocus,
}: EditEstimateEntryDialogProps) {
  const { label, amountOptions, notePlaceholder } = ESTIMATE_TRACKERS[tracker];
  const domain = CARD_THEMES[tracker].domain;
  const idPrefix = `edit-${tracker}`;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-domain={domain}>
        <DialogHeader>
          <DialogTitle>Edit {label} Entry</DialogTitle>
          <DialogDescription>Update the time, amount estimate, or note</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-timestamp`}>Time</Label>
            <Input
              id={`${idPrefix}-timestamp`}
              type="datetime-local"
              value={timestamp}
              onChange={(e) => onTimestampChange(e.target.value)}
              onFocus={onFocus}
              aria-required="true"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-amount`}>Amount (optional)</Label>
            <Select
              value={amount || NONE_VALUE}
              onValueChange={(v) =>
                onAmountChange(v === NONE_VALUE ? "" : v)
              }
            >
              <SelectTrigger id={`${idPrefix}-amount`}>
                <SelectValue placeholder="Select estimate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>No estimate</SelectItem>
                {amountOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-note`}>Note (optional)</Label>
            <Textarea
              id={`${idPrefix}-note`}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={notePlaceholder}
              className="min-h-[60px]"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
