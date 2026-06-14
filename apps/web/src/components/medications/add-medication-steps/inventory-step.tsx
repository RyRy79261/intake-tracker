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
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-1.5 block">Current stock (pills on hand)</Label>
        <Input
          type="number"
          min="0"
          value={currentStock}
          onChange={(e) => onFieldChange("currentStock", e.target.value)}
          placeholder="e.g. 36"
        />
      </div>

      <div className="pt-2 border-t">
        <p className="text-sm font-medium mb-3">Refill reminders</p>

        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block">Alert when days of supply left reaches</Label>
            <Input
              type="number"
              min="0"
              value={refillAlertDays}
              onChange={(e) => onFieldChange("refillAlertDays", e.target.value)}
              placeholder="e.g. 7 (days)"
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Or alert when pills remaining reaches</Label>
            <Input
              type="number"
              min="0"
              value={refillAlertPills}
              onChange={(e) => onFieldChange("refillAlertPills", e.target.value)}
              placeholder="e.g. 10 (pills)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
