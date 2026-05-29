"use client";

import { type FocusEvent, type FormEvent } from "react";
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

const NONE_VALUE = "__none__";

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
  /** Tailwind classes for the submit button accent (e.g. "bg-violet-600 hover:bg-violet-700"). */
  accentClassName: string;
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
  accentClassName,
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
      <DialogContent className="sm:max-w-md">
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
            <Label>Amount (optional)</Label>
            <Select
              value={allowNoEstimate ? amount || NONE_VALUE : amount}
              onValueChange={(v) =>
                onAmountChange(allowNoEstimate && v === NONE_VALUE ? "" : v)
              }
            >
              <SelectTrigger>
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
            <Button type="submit" className={accentClassName}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
