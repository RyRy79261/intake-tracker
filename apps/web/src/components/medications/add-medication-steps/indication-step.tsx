"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search } from "lucide-react";
import { useAuthGate } from "@/components/auth-guard";
import { cn } from "@/lib/utils";
import type { FoodInstruction } from "@/lib/db";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import type { FieldChange } from "@/components/medications/add-medication-steps/types";

export function IndicationStep({
  formState, onFieldChange,
  onRefreshAI, isRefreshing = false,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
  onRefreshAI?: () => void;
  isRefreshing?: boolean;
}) {
  const showAi = useAuthGate();
  const { indication, contraindications, warnings, foodInstruction, foodNote, notes, selectedPrescriptionId } = formState;
  const isExistingPrescription = selectedPrescriptionId !== "new";
  const foodOptions: { value: FoodInstruction; label: string }[] = [
    { value: "before", label: "Before eating" },
    { value: "after", label: "After eating" },
    { value: "none", label: "Not important" },
  ];

  return (
    <div className="space-y-4">
      {!isExistingPrescription && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm font-medium">What is this medication for?</Label>
              {showAi && onRefreshAI && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefreshAI}
                  disabled={isRefreshing}
                  className="h-7 text-xs gap-1 text-teal-600"
                >
                  {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  AI Suggest
                </Button>
              )}
            </div>
            <Textarea
              value={indication}
              onChange={(e) => onFieldChange("indication", e.target.value)}
              placeholder="e.g. Heart failure, Acute Myocardial Infarction"
              rows={2}
            />
          </div>

          {(contraindications.length > 0 || warnings.length > 0) && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3 space-y-3">
              {contraindications.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-800 dark:text-red-400 uppercase tracking-wider mb-1">
                    Contraindications
                  </p>
                  <ul className="list-disc list-inside text-xs text-red-700 dark:text-red-300 ml-4 space-y-0.5">
                    {contraindications.map((c, i) => <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}</li>)}
                  </ul>
                </div>
              )}
              {warnings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-500 uppercase tracking-wider mb-1">
                    Warnings
                  </p>
                  <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 ml-4 space-y-0.5">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div>
        <Label className="text-sm font-medium mb-2 block">Food instruction</Label>
        <div className="flex gap-2">
          {foodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onFieldChange("foodInstruction", opt.value)}
              className={cn(
                "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors",
                foodInstruction === opt.value
                  ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/40 dark:border-teal-700 dark:text-teal-300"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {foodInstruction !== "none" && (
        <div>
          <Label className="text-sm mb-1.5 block">Food note (optional)</Label>
          <Input
            value={foodNote}
            onChange={(e) => onFieldChange("foodNote", e.target.value)}
            placeholder={`e.g. Take ${foodInstruction} eating with water`}
          />
        </div>
      )}

      <div>
        <Label className="text-sm font-medium mb-1.5 block">Additional notes</Label>
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
