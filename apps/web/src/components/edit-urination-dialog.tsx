"use client";

import { type FocusEvent } from "react";
import { type UrinationRecord } from "@/lib/db";
import { URINATION_AMOUNT_OPTIONS } from "@/lib/constants";
import { EditEstimateEntryDialog } from "@/components/edit-estimate-entry-dialog";

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
      amountOptions={URINATION_AMOUNT_OPTIONS}
      allowNoEstimate
      notePlaceholder="e.g. colour, urgency"
      accentClassName="bg-violet-600 hover:bg-violet-700"
      idPrefix="edit-urination"
      {...rest}
    />
  );
}
