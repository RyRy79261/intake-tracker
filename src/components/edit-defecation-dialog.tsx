"use client";

import { type FocusEvent } from "react";
import { type DefecationRecord } from "@/lib/db";
import { DEFECATION_AMOUNT_OPTIONS } from "@/lib/constants";
import { EditEstimateEntryDialog } from "@/components/edit-estimate-entry-dialog";

interface EditDefecationDialogProps {
  record: DefecationRecord | null;
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

export function EditDefecationDialog({ record, ...rest }: EditDefecationDialogProps) {
  return (
    <EditEstimateEntryDialog
      open={record !== null}
      title="Edit Defecation Entry"
      amountOptions={DEFECATION_AMOUNT_OPTIONS}
      allowNoEstimate
      notePlaceholder="e.g. consistency, urgency"
      accentClassName="bg-stone-600 hover:bg-stone-700"
      idPrefix="edit-defecation"
      {...rest}
    />
  );
}
