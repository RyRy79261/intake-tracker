"use client";

import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Switch } from "@intake/ui/switch";
import { cn } from "@/lib/utils";
import { resolveWizardDose, type AddMedicationFormState } from "@/hooks/use-add-medication-form";
import { formatCompoundFull, isCleanFraction } from "@intake/core/compound";
import { type FieldChange, DOSE_MULTIPLIERS } from "@/components/medications/add-medication-steps/types";

export function DosageStep({
  formState, onFieldChange, error,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
  error?: string | undefined;
}) {
  const { dosageAmount, customDosage, dosageStrength, asNeeded, isCombination, compounds } = formState;
  // The same resolver handleSave uses, so the preview shows exactly what is
  // saved. The search step blocks an unreadable strength, so `dose` is only
  // null if state got here some other way — fall back to 1 for display.
  const dose = resolveWizardDose(formState);
  const strengthNum = dose?.strength ?? 1;
  const unit = dose?.unit ?? "mg";
  const pillContents = isCombination
    ? formatCompoundFull(compounds, "mg")
    : dosageStrength;
  const pillsNeeded = dose?.pills ?? dosageAmount;
  const prescribedAmount = dose?.total ?? pillsNeeded * strengthNum;
  const validDose = Number.isFinite(pillsNeeded) && pillsNeeded > 0;
  // Flag a split that can't be cut from whole, half, third or quarter
  // tablets before it is saved, like the edit and titration dose editors.
  const unevenSplit = validDose && !isCleanFraction(pillsNeeded);

  return (
    <div className="space-y-4">
      {pillContents && (
        <p className="text-sm text-muted-foreground">
          Each pill contains <span className="font-medium text-foreground">{pillContents}</span>
        </p>
      )}
      {!isCombination && dose && (
        <p className="text-xs text-muted-foreground">
          Read as <span className="font-medium text-foreground">1 pill = {strengthNum} {unit}</span>
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
          aria-invalid={!validDose || undefined}
        />
        {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      </div>

      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {pillsNeeded === 1 ? "1 pill" : `${pillsNeeded} pills`}
          </span>
          {" per dose = "}
          <span className="font-medium text-foreground">{prescribedAmount}{unit}</span>
          {isCombination && " total"}
          {validDose && pillsNeeded < 1 && " (partial pill)"}
        </p>
        {unevenSplit && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Not a whole or half tablet: check how this dose is split before saving.
          </p>
        )}
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
