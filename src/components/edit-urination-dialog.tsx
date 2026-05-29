"use client";

import { type FocusEvent } from "react";
import { type UrinationRecord } from "@/lib/db";
import { EditEstimateEntryDialog } from "@/components/edit-estimate-entry-dialog";

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

export function EditUrinationDialog({ record, ...rest }: EditUrinationDialogProps) {
  return (
    <EditEstimateEntryDialog
      open={record !== null}
      title="Edit Urination Entry"
      amountOptions={AMOUNT_OPTIONS}
      notePlaceholder="e.g. colour, urgency"
      accentClassName="bg-violet-600 hover:bg-violet-700"
      idPrefix="edit-urination"
      {...rest}
    />
  );
}
