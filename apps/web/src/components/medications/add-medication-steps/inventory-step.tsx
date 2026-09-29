"use client";

import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import type { FieldChange } from "@/components/medications/add-medication-steps/types";

export function InventoryStep({
  formState, onFieldChange,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
}) {
  const { currentStock, refillAlertDays, refillAlertPills } = formState;
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Current stock (pills on hand)</Label>
        <Input
          type="number"
          min="0"
          value={currentStock}
          onChange={(e) => onFieldChange("currentStock", e.target.value)}
          placeholder="e.g. 36"
          className="font-mono"
        />
      </div>

      <div className="border-t border-line pt-3">
        <p className="mb-2 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground">REFILL REMINDERS</p>

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Alert when days of supply left reaches</Label>
            <Input
              type="number"
              min="0"
              value={refillAlertDays}
              onChange={(e) => onFieldChange("refillAlertDays", e.target.value)}
              placeholder="e.g. 7 (days)"
              className="font-mono"
            />
          </div>

          <div>
            <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Or alert when pills remaining reaches</Label>
            <Input
              type="number"
              min="0"
              value={refillAlertPills}
              onChange={(e) => onFieldChange("refillAlertPills", e.target.value)}
              placeholder="e.g. 10 (pills)"
              className="font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
