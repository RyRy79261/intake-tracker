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
    <div className="flex flex-col gap-3.5">
      {pillContents && (
        <p className="text-sm text-muted-foreground">
          Each pill contains <span className="font-mono font-semibold text-foreground">{pillContents}</span>
        </p>
      )}
      {!isCombination && dose && (
        <p className="text-[0.8125rem] text-muted-foreground">
          Read as <span className="font-mono font-semibold text-foreground">1 pill = {strengthNum} {unit}</span>
        </p>
      )}

      <div className="flex min-h-11 items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">As needed (PRN)</p>
          <p className="text-[0.8125rem] text-muted-foreground">No fixed times. You log each dose when you take it.</p>
        </div>
        <Switch checked={asNeeded} onCheckedChange={(v) => onFieldChange("asNeeded", v)} aria-label="As needed (PRN)" />
      </div>

      <div>
        <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">
          {isCombination ? "Pills per dose" : "Prescribed dose amount"}
        </Label>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={isCombination ? "Pills per dose" : "Prescribed dose amount"}>
          {DOSE_MULTIPLIERS.map((mult) => {
            const label = isCombination
              ? mult === 1
                ? "1 pill"
                : `${mult} pills`
              : `${mult * strengthNum}${unit}`;
            return (
              <button
                key={mult}
                type="button"
                role="radio"
                aria-checked={dosageAmount === mult && !customDosage}
                onClick={() => { onFieldChange("dosageAmount", mult); onFieldChange("customDosage", ""); }}
                className={cn(
                  "min-h-11 border px-1 font-mono text-sm font-medium",
                  dosageAmount === mult && !customDosage ? "border-foreground bg-foreground text-background" : "border-line hover:bg-foreground/6",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">
          {isCombination ? "Or type pills per dose" : `Or type a custom dose (${unit})`}
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
          className="font-mono"
        />
        {error && <p role="alert" className="mt-1 text-[0.8125rem] text-bp">{error}</p>}
      </div>

      <div aria-live="polite" className="border border-dashed border-muted-foreground p-2.5 text-sm leading-[1.45]">
        <p>
          <span className="font-semibold text-meds">
            {pillsNeeded === 1 ? "1 pill" : `${pillsNeeded} pills`}
          </span>
          {" per dose = "}
          <span className="font-semibold text-meds">{prescribedAmount}{unit}</span>
          {isCombination && " total"}
          {validDose && pillsNeeded < 1 && " (partial pill)"}
        </p>
        {unevenSplit && (
          <p className="mt-1 text-[0.8125rem] text-sodium">
            Not a whole or half tablet: check how this dose is split before saving.
          </p>
        )}
      </div>

    </div>
  );
}
