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
import type { Domain } from "@/lib/domain-colors";
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

export interface EstimateOption {
  value: string;
  label: string;
}

export interface EditEstimateEntryDialogProps {
  /** Whether the dialog is open (typically `record !== null`). */
  open: boolean;
  title: string;
  /** Options for the amount-estimate Select. */
  amountOptions: readonly EstimateOption[];
  /** When true, prepends a "No estimate" sentinel that maps to "". */
  allowNoEstimate?: boolean;
  notePlaceholder?: string;
  /** The entry's domain: the dialog's stripe, Save button and focus rings take its colour. */
  domain: Domain;
  /** Prefix for the field element ids (e.g. "edit-urination"). */
  idPrefix: string;
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
 * Shared edit dialog for the "time + optional amount-estimate + note" record
 * pattern (urination, defecation). Domain dialogs wrap this with their title,
 * options, placeholder, accent colour and id prefix.
 */
export function EditEstimateEntryDialog({
  open,
  title,
  amountOptions,
  allowNoEstimate = false,
  notePlaceholder,
  domain,
  idPrefix,
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-domain={domain}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
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
              value={allowNoEstimate ? amount || NONE_VALUE : amount}
              onValueChange={(v) =>
                onAmountChange(allowNoEstimate && v === NONE_VALUE ? "" : v)
              }
            >
              <SelectTrigger id={`${idPrefix}-amount`}>
                <SelectValue placeholder="Select estimate" />
              </SelectTrigger>
              <SelectContent>
                {allowNoEstimate && <SelectItem value={NONE_VALUE}>No estimate</SelectItem>}
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
