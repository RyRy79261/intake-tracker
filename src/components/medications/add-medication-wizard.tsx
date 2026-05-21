"use client";

import { useState, useCallback } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useMedicineSearch, MedicineSearchCancelledError } from "@/hooks/use-medicine-search";
import { useAuthGate } from "@/components/auth-guard";
import { useAddPrescription, usePrescriptions, useAddMedicationToPrescription, usePhasesForPrescription } from "@/hooks/use-medication-queries";
import { useToast } from "@/hooks/use-toast";
import type { PillShape, MedicationPhase } from "@/lib/db";
import { ArrowLeft, ArrowRight, Loader2, Check, X } from "lucide-react";
import { useInteractionCheck } from "@/hooks/use-interaction-check";
import { cn } from "@/lib/utils";
import {
  useAddMedicationForm,
  type AddMedicationFormState,
  type WizardStep,
} from "@/hooks/use-add-medication-form";
import { SearchStep } from "@/components/medications/add-medication-steps/search-step";
import { AppearanceStep } from "@/components/medications/add-medication-steps/appearance-step";
import { IndicationStep } from "@/components/medications/add-medication-steps/indication-step";
import { DosageStep } from "@/components/medications/add-medication-steps/dosage-step";
import { ScheduleStep } from "@/components/medications/add-medication-steps/schedule-step";
import { InventoryStep } from "@/components/medications/add-medication-steps/inventory-step";
import { ConflictCheckOverlay, type ConflictCheckState } from "@/components/medications/add-medication-steps/conflict-check-overlay";
import { PILL_SHAPES, COLOR_NAME_MAP } from "@/components/medications/add-medication-steps/types";
import { compoundSum, formatCompoundNames } from "@/lib/compound-utils";

const STEPS: WizardStep[] = ["search", "appearance", "indication", "dosage", "schedule", "inventory"];
const STEP_LABELS: Record<WizardStep, string> = {
  search: "Search Medicine",
  appearance: "Pill Appearance",
  indication: "Indication & Notes",
  dosage: "Dosage",
  schedule: "Schedule",
  inventory: "Inventory",
};

interface AddMedicationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function capitalizeWords(str: string) {
  if (!str) return "";
  return str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function AddMedicationWizard({ open, onOpenChange }: AddMedicationWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("search");
  const showAi = useAuthGate();
  const searchMutation = useMedicineSearch();
  const addPrescriptionMutation = useAddPrescription();
  const addMedicationToPrescriptionMutation = useAddMedicationToPrescription();
  const existingPrescriptions = usePrescriptions();

  const { formState, errors, onFieldChange, patch, validateStep, clearErrors, reset: resetForm } = useAddMedicationForm();

  const isExistingPrescription = formState.selectedPrescriptionId !== "new";
  const selectedPrescriptionPhases = usePhasesForPrescription(
    isExistingPrescription ? formState.selectedPrescriptionId : undefined
  );

  const [conflictCheckState, setConflictCheckState] = useState<ConflictCheckState>("idle");
  const { check: checkInteractions, data: conflictData, reset: resetConflicts } = useInteractionCheck();

  // Dynamic steps. Adding a brand to an existing prescription is a pure
  // inventory addition — indication, dosage and schedule belong to the
  // prescription itself, so those steps are skipped.
  const activeSteps = STEPS.filter(s => {
    if ((s === "indication" || s === "dosage") && isExistingPrescription) return false;
    if (s === "schedule" && (isExistingPrescription || formState.asNeeded)) return false;
    return true;
  });

  // Pre-populate fields from existing prescription's active phase
  const handlePrescriptionSelect = useCallback((id: string) => {
    onFieldChange("selectedPrescriptionId", id);
    if (id !== "new") {
      const partial: Partial<AddMedicationFormState> = {};
      const activePhase = selectedPrescriptionPhases.find((p: MedicationPhase) => p.status === "active");
      if (activePhase) {
        partial.foodInstruction = activePhase.foodInstruction;
        if (activePhase.foodNote) partial.foodNote = activePhase.foodNote;
      }
      // A combination prescription dictates the new brand is also a combo —
      // pre-fill the ingredient names so only the per-pill mg need entering.
      const rx = existingPrescriptions.find((p) => p.id === id);
      if (rx?.compounds && rx.compounds.length >= 2) {
        partial.isCombination = true;
        partial.compounds = rx.compounds.map((c) => ({ name: c.name, strength: 0 }));
      }
      if (Object.keys(partial).length > 0) patch(partial);
    }
  }, [existingPrescriptions, selectedPrescriptionPhases, onFieldChange, patch]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(() => {
      resetForm();
      setStep("search");
      setConflictCheckState("idle");
      resetConflicts();
    }, 300);
  }, [onOpenChange, resetForm, resetConflicts]);

  const handleSearch = async () => {
    const query = formState.searchQuery.trim();
    if (!query) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
    try {
      const result = await searchMutation.mutateAsync(query);
      const partial: Partial<AddMedicationFormState> = { searchResult: result };

      if (!formState.brandName) {
        partial.brandName = capitalizeWords(query);
      }

      if (result.genericName) partial.genericName = capitalizeWords(result.genericName);
      // Auto-select dosage strength from search query (e.g., "Eliquis 5mg" -> select "5mg")
      if (result.dosageStrengths.length > 0) {
        const doseMatch = query.match(/(\d+(?:\.\d+)?)\s*mg/i);
        if (doseMatch && doseMatch[1]) {
          const queryDose = doseMatch[1];
          const matchingStrength = result.dosageStrengths.find(s =>
            s.toLowerCase().includes(queryDose + "mg") || s.toLowerCase().includes(queryDose + " mg")
          );
          partial.dosageStrength = matchingStrength ?? result.dosageStrengths[0] ?? "";
        } else if (result.dosageStrengths[0]) {
          partial.dosageStrength = result.dosageStrengths[0];
        }
      }
      // Combination drug: auto-enable the toggle and pre-fill both compounds
      // from a marketed strength option (matching the query's number if given).
      const comboOptions = (result.strengthOptions ?? []).filter(
        (o) => o.compounds.length >= 2,
      );
      if ((result.activeIngredients?.length ?? 0) >= 2 && comboOptions.length > 0) {
        partial.isCombination = true;
        const doseMatch = query.match(/(\d+(?:\.\d+)?)/);
        let chosen = comboOptions[0];
        if (doseMatch && doseMatch[1]) {
          const q = doseMatch[1];
          const matched = comboOptions.find(
            (o) =>
              o.label.includes(q) ||
              String(compoundSum(o.compounds)).startsWith(q),
          );
          if (matched) chosen = matched;
        }
        if (chosen) {
          partial.compounds = chosen.compounds.map((c) => ({
            name: c.name,
            strength: c.strength,
          }));
        }
      }
      if (result.commonIndications.length > 0) partial.indication = result.commonIndications.join(", ");
      if (result.contraindications) partial.contraindications = result.contraindications;
      if (result.warnings) partial.warnings = result.warnings;
      if (result.visualIdentification) partial.visualIdentification = result.visualIdentification;
      if (result.foodInstruction) partial.foodInstruction = result.foodInstruction;
      if (result.foodNote) partial.foodNote = result.foodNote;
      if (result.pillColor) {
        const hex = COLOR_NAME_MAP[result.pillColor.toLowerCase()];
        if (hex) partial.pillColor = hex;
      }
      if (result.pillShape) {
        const shape = result.pillShape.toLowerCase() as PillShape;
        if (PILL_SHAPES.some((s) => s.value === shape)) partial.pillShape = shape;
      }

      patch(partial);
    } catch {
      // error is in searchMutation.error
    }
  };

  const currentStepIndex = activeSteps.indexOf(step);
  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < activeSteps.length - 1;
  const isLastStep = currentStepIndex === activeSteps.length - 1;

  const goBack = () => {
    clearErrors();
    setConflictCheckState("idle");
    resetConflicts();
    const prev = activeSteps[currentStepIndex - 1];
    if (canGoBack && prev) setStep(prev);
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    const next = activeSteps[currentStepIndex + 1];
    if (canGoNext && next) setStep(next);
  };

  const handleSave = async () => {
    if (!validateStep(step)) return;

    // Conflict check for new prescriptions (AI-driven; skip when signed out)
    if (showAi && conflictCheckState === "idle" && formState.selectedPrescriptionId === "new") {
      const activeMeds = existingPrescriptions.filter((p) => p.isActive);
      if (activeMeds.length > 0) {
        setConflictCheckState("checking");
        try {
          const result = await checkInteractions({
            mode: "conflict",
            newMedication: formState.genericName || formState.searchQuery,
            activePrescriptions: activeMeds.map((p) => ({ genericName: p.genericName })),
          });
          if (result) {
            const hasConflicts = result.interactions.some(
              (i) => i.severity === "AVOID" || i.severity === "CAUTION"
            );
            if (hasConflicts) {
              setConflictCheckState("warning");
              return;
            }
          }
          // No result (error) or no conflicts — proceed to save
        } catch {
          // AI unavailable — proceed to save
        }
      }
    }

    // If warning, user acknowledged via "Save Anyway" — proceed to save

    const parseStrength = (str: string): { strength: number; unit: string } => {
      if (!str) return { strength: 1, unit: "mg" };
      const match = str.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
      if (match && match[1] && match[2]) {
        return { strength: parseFloat(match[1]), unit: match[2].toLowerCase() };
      }
      const num = parseFloat(str);
      if (!isNaN(num)) return { strength: num, unit: "mg" };
      return { strength: 1, unit: "mg" };
    };

    // Combination drugs keep `strength` as the SUM of compound strengths, so
    // the pill math (dosage / strength) stays identical to single-compound.
    const validCompounds = formState.compounds.filter(
      (c) => c.name.trim() !== "" && c.strength > 0,
    );
    const isCombo = formState.isCombination && validCompounds.length >= 2;

    const { strength, unit } = isCombo
      ? { strength: compoundSum(validCompounds), unit: "mg" }
      : parseStrength(formState.dosageStrength);
    const compoundsForSave = isCombo ? validCompounds : undefined;
    const finalDosage = formState.customDosage ? parseFloat(formState.customDosage) : formState.dosageAmount;
    const scheduleDosage = (finalDosage || 1) * strength;

    try {
      const refillDays = parseInt(formState.refillAlertDays) || undefined;
      const refillPills = parseInt(formState.refillAlertPills) || undefined;
      const finalBrandName = formState.brandName || capitalizeWords(formState.searchQuery);
      const finalSchedules = formState.asNeeded
        ? []
        : formState.schedules
            .filter((s) => s.time && s.daysOfWeek.length > 0)
            .map((s) => ({ ...s, dosage: scheduleDosage }));

      if (formState.selectedPrescriptionId !== "new") {
        await addMedicationToPrescriptionMutation.mutateAsync({
          prescriptionId: formState.selectedPrescriptionId,
          brandName: finalBrandName,
          strength,
          unit,
          pillShape: formState.pillShape,
          pillColor: formState.pillColor,
          ...(formState.visualIdentification && { visualIdentification: formState.visualIdentification }),
          ...(compoundsForSave && { compounds: compoundsForSave }),
          currentStock: parseInt(formState.currentStock) || 0,
          ...(refillDays !== undefined && { refillAlertDays: refillDays }),
          ...(refillPills !== undefined && { refillAlertPills: refillPills }),
        });
      } else {
        await addPrescriptionMutation.mutateAsync({
          brandName: finalBrandName,
          genericName:
            formState.genericName ||
            (isCombo ? formatCompoundNames(validCompounds) : formState.brandName),
          strength,
          unit,
          pillShape: formState.pillShape,
          pillColor: formState.pillColor,
          ...(formState.visualIdentification && { visualIdentification: formState.visualIdentification }),
          ...(compoundsForSave && { compounds: compoundsForSave }),
          indication: formState.indication,
          ...(formState.contraindications.length > 0 && { contraindications: formState.contraindications }),
          ...(formState.warnings.length > 0 && { warnings: formState.warnings }),
          foodInstruction: formState.foodInstruction,
          ...(formState.foodNote && { foodNote: formState.foodNote }),
          currentStock: parseInt(formState.currentStock) || 0,
          ...(refillDays !== undefined && { refillAlertDays: refillDays }),
          ...(refillPills !== undefined && { refillAlertPills: refillPills }),
          ...(formState.notes && { notes: formState.notes }),
          schedules: finalSchedules,
        });
      }
      handleClose();
    } catch (err: unknown) {
      console.error(err);
      toast({
        title: "Failed to save prescription",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const searchError =
    searchMutation.error &&
    !(searchMutation.error instanceof MedicineSearchCancelledError) &&
    searchMutation.error.message
      ? searchMutation.error.message
      : undefined;

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) handleClose(); }} repositionInputs={false}>
      <DrawerContent className="w-full max-w-[100vw] overflow-hidden max-h-[90dvh]" aria-describedby={undefined}>
        <DrawerTitle className="sr-only">Add medication</DrawerTitle>
        <ConflictCheckOverlay
          state={conflictCheckState}
          data={conflictData}
          onDismiss={() => {
            resetConflicts();
            setConflictCheckState("idle");
          }}
          onConfirm={() => {
            setConflictCheckState("warning");
            handleSave();
          }}
        />

        <div className="p-4 px-5">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={canGoBack ? goBack : handleClose}>
              {canGoBack ? <ArrowLeft className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </Button>
            <div className="text-center">
              <p className="text-sm font-medium">{STEP_LABELS[step]}</p>
              <p className="text-xs text-muted-foreground">
                Step {currentStepIndex + 1} of {activeSteps.length}
              </p>
            </div>
            <div className="w-10" />
          </div>

          <div className="flex gap-1 mb-6">
            {activeSteps.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= currentStepIndex ? "bg-teal-500" : "bg-muted"
                )}
              />
            ))}
          </div>

          <div className="min-h-[300px] max-h-[60dvh] overflow-y-auto px-2 pb-2">
            {step === "search" && (
              <SearchStep
                formState={formState}
                onFieldChange={onFieldChange}
                errors={errors}
                existingPrescriptions={existingPrescriptions}
                onSelectPrescription={handlePrescriptionSelect}
                onSearch={handleSearch}
                isSearching={searchMutation.isPending}
                {...(searchError && { searchError })}
              />
            )}
            {step === "appearance" && (
              <AppearanceStep formState={formState} onFieldChange={onFieldChange} />
            )}
            {step === "indication" && (
              <IndicationStep
                formState={formState}
                onFieldChange={onFieldChange}
                onRefreshAI={handleSearch}
                isRefreshing={searchMutation.isPending}
              />
            )}
            {step === "dosage" && (
              <DosageStep formState={formState} onFieldChange={onFieldChange} />
            )}
            {step === "schedule" && (
              <ScheduleStep formState={formState} onFieldChange={onFieldChange} />
            )}
            {step === "inventory" && (
              <InventoryStep formState={formState} onFieldChange={onFieldChange} />
            )}
          </div>

          <div className="flex gap-3 mt-6">
            {canGoBack && (
              <Button variant="outline" onClick={goBack} className="flex-1 gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            {isLastStep ? (
              <Button
                onClick={handleSave}
                disabled={addPrescriptionMutation.isPending || addMedicationToPrescriptionMutation.isPending}
                className="flex-1 gap-2 bg-teal-600 hover:bg-teal-700"
              >
                {(addPrescriptionMutation.isPending || addMedicationToPrescriptionMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Medication
              </Button>
            ) : (
              <Button onClick={goNext} className="flex-1 gap-2 bg-teal-600 hover:bg-teal-700">
                Next
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
