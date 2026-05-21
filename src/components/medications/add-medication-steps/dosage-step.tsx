"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import { compoundSum, formatCompoundFull } from "@/lib/compound-utils";
import { type FieldChange, DOSE_MULTIPLIERS } from "@/components/medications/add-medication-steps/types";

export function DosageStep({
  formState, onFieldChange,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
}) {
  const { dosageAmount, customDosage, dosageStrength, asNeeded, isCombination, compounds } = formState;
  const parseStrengthNum = (str: string): number => {
    const match = str.match(/(\d+(?:\.\d+)?)/);
    return match?.[1] ? parseFloat(match[1]) : 1;
  };
  const parseStrengthUnit = (str: string): string => {
    const match = str.match(/\d+(?:\.\d+)?\s*([a-zA-Z]+)/);
    return match?.[1] ?? "mg";
  };

  const strengthNum = isCombination
    ? compoundSum(compounds) || 1
    : parseStrengthNum(dosageStrength);
  const unit = isCombination ? "mg" : parseStrengthUnit(dosageStrength);
  const pillContents = isCombination
    ? formatCompoundFull(compounds, "mg")
    : dosageStrength;
  const activeDosage = customDosage ? parseFloat(customDosage) || 1 : dosageAmount;
  const prescribedAmount = activeDosage * strengthNum;
  const pillsNeeded = activeDosage;

  return (
    <div className="space-y-4">
      {pillContents && (
        <p className="text-sm text-muted-foreground">
          Each pill contains <span className="font-medium text-foreground">{pillContents}</span>
        </p>
      )}

      <div>
        <Label className="text-sm font-medium mb-2 block">
          {isCombination ? "Pills per dose" : "Prescribed dose amount"}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {DOSE_MULTIPLIERS.map((mult) => {
            const label = isCombination
              ? mult === 1
                ? "1 pill"
                : `${mult} pills`
              : `${mult * strengthNum}${unit}`;
            return (
              <button
                key={mult}
                onClick={() => { onFieldChange("dosageAmount", mult); onFieldChange("customDosage", ""); }}
                className={cn(
                  "py-3 rounded-lg border text-sm font-medium transition-colors",
                  dosageAmount === mult && !customDosage
                    ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/40 dark:border-teal-700 dark:text-teal-300"
                    : "border-border hover:bg-muted"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="text-sm mb-1.5 block">
          {isCombination ? "Custom pills per dose" : `Custom dose (${unit})`}
        </Label>
        <Input
          type="number"
          step="any"
          min="0"
          value={
            isCombination
              ? customDosage
              : customDosage
                ? String(parseFloat(customDosage) * strengthNum || "")
                : ""
          }
          onChange={(e) => {
            if (isCombination) {
              const pills = parseFloat(e.target.value);
              onFieldChange("customDosage", isNaN(pills) ? "" : String(pills));
              return;
            }
            const mgVal = parseFloat(e.target.value);
            if (!isNaN(mgVal) && strengthNum > 0) {
              onFieldChange("customDosage", String(mgVal / strengthNum));
            } else {
              onFieldChange("customDosage", "");
            }
          }}
          placeholder={isCombination ? "e.g. 2" : `e.g. ${strengthNum * 2}${unit}`}
        />
      </div>

      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {pillsNeeded === 1 ? "1 pill" : `${pillsNeeded} pills`}
          </span>
          {" per dose = "}
          <span className="font-medium text-foreground">{prescribedAmount}{unit}</span>
          {isCombination && " total"}
          {pillsNeeded < 1 && " (partial pill)"}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">As needed (PRN)</p>
          <p className="text-xs text-muted-foreground">No fixed schedule — take when needed</p>
        </div>
        <Switch checked={asNeeded} onCheckedChange={(v) => onFieldChange("asNeeded", v)} />
      </div>
    </div>
  );
}
