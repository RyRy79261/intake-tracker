"use client";

import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { Textarea } from "@intake/ui/textarea";
import { cn } from "@/lib/utils";
import type { FoodInstruction } from "@/lib/db";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import type { FieldChange } from "@/components/medications/add-medication-steps/types";

/** Indication, safety notes, food and notes. The AI lookup sits above it. */
export function IndicationStep({
  formState, onFieldChange,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
}) {
  const { indication, contraindications, warnings, foodInstruction, foodNote, notes, selectedPrescriptionId } = formState;
  const isExistingPrescription = selectedPrescriptionId !== "new";
  const foodOptions: { value: FoodInstruction; label: string }[] = [
    { value: "before", label: "Before eating" },
    { value: "after", label: "After eating" },
    { value: "none", label: "No instruction" },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      {!isExistingPrescription && (
        <>
          <div>
            <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Indication</Label>
            <Textarea
              value={indication}
              onChange={(e) => onFieldChange("indication", e.target.value)}
              placeholder="e.g. Heart failure, Acute Myocardial Infarction"
              rows={2}
            />
          </div>

          {(contraindications.length > 0 || warnings.length > 0) && (
            <div className="space-y-3 border border-bp bg-bp/8 p-3">
              {contraindications.length > 0 && (
                <div>
                  <p className="mb-1 text-[0.6875rem] font-semibold tracking-[0.06em] text-bp">
                    Contraindications
                  </p>
                  <ul className="ml-4 list-inside list-disc space-y-0.5 text-[0.8125rem]">
                    {contraindications.map((c, i) => <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}</li>)}
                  </ul>
                </div>
              )}
              {warnings.length > 0 && (
                <div>
                  <p className="mb-1 text-[0.6875rem] font-semibold tracking-[0.06em] text-sodium">
                    Warnings
                  </p>
                  <ul className="ml-4 list-inside list-disc space-y-0.5 text-[0.8125rem]">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div>
        <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Food</Label>
        <div className="flex border border-input" role="radiogroup" aria-label="Food instruction">
          {foodOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={foodInstruction === opt.value}
              onClick={() => onFieldChange("foodInstruction", opt.value)}
              className={cn(
                "min-h-10 flex-1 border-l border-input px-2 text-[0.8125rem] font-medium first:border-l-0",
                foodInstruction === opt.value ? "bg-foreground text-background" : "hover:bg-foreground/6",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {foodInstruction !== "none" && (
        <div>
          <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Food note (optional)</Label>
          <Input
            value={foodNote}
            onChange={(e) => onFieldChange("foodNote", e.target.value)}
            placeholder={`e.g. Take ${foodInstruction} eating with water`}
          />
        </div>
      )}

      <div>
        <Label className="mb-1 block text-[0.8125rem] font-normal text-muted-foreground">Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => onFieldChange("notes", e.target.value)}
          placeholder="e.g. Must cut pills in half"
          rows={2}
        />
      </div>
    </div>
  );
}
