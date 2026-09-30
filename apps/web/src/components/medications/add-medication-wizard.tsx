"use client";

import { useState, useCallback } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
import {
  MedicineLookupPanel,
  useMedicineLookup,
  type ApplyContext,
} from "@/components/medications/medicine-lookup-panel";
import {
  applyToNewBrand,
  applyToNewPrescription,
  type LookupGroup,
} from "@/components/medications/medicine-lookup";
import { useAuthGate } from "@/components/auth-guard";
import { useAddPrescription, usePrescriptions, useAddMedicationToPrescription, usePhasesForPrescription } from "@/hooks/use-medication-queries";
import { useToast } from "@intake/ui/use-toast";
import type { MedicationPhase, CompoundStrength, Prescription } from "@/lib/db";
import { AlertTriangle, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";
import { useInteractionCheck } from "@/hooks/use-interaction-check";
import { cn } from "@/lib/utils";
import {
  useAddMedicationForm,
  resolveWizardDose,
  findDuplicatePrescription,
  parseStockInput,
  type AddMedicationFormState,
  type WizardStep,
} from "@/hooks/use-add-medication-form";
import { convertStrength, normalizeStrengthUnit } from "@intake/core/strength";
import { selectEffectivePhase } from "@intake/core/effective-phase";
import { isLive } from "@intake/core/lifecycle";
import { SearchStep } from "@/components/medications/add-medication-steps/search-step";
import { AppearanceStep } from "@/components/medications/add-medication-steps/appearance-step";
import { IndicationStep } from "@/components/medications/add-medication-steps/indication-step";
import { DosageStep } from "@/components/medications/add-medication-steps/dosage-step";
import { ScheduleStep } from "@/components/medications/add-medication-steps/schedule-step";
import { InventoryStep } from "@/components/medications/add-medication-steps/inventory-step";
import { ConflictCheckOverlay, type ConflictCheckState } from "@/components/medications/add-medication-steps/conflict-check-overlay";
import { formatCompoundNames } from "@intake/core/compound";

const STEPS: WizardStep[] = ["search", "appearance", "indication", "dosage", "schedule", "inventory"];
const STEP_LABELS: Record<WizardStep, string> = {
  search: "Search Medicine",
  appearance: "Pill Appearance",
  indication: "Indication & Notes",
  dosage: "Dosage",
  schedule: "Schedule",
  inventory: "Inventory",
};
/**
 * What the AI lookup can fill in on each step of a new prescription. Step 1
 * offers everything; later steps offer only their own fields (prototype
 * `lookGroups`). The Inventory step has no lookup.
 */
const NEW_RX_LOOKUP_GROUPS: Record<WizardStep, LookupGroup[]> = {
  search: ["names", "strength", "appearance", "indication", "food"],
  appearance: ["appearance"],
  indication: ["indication", "food"],
  dosage: ["strength"],
  schedule: ["food"],
  inventory: [],
};

/** The question each step asks (`.wq`). */
const STEP_QUESTIONS: Record<WizardStep, string> = {
  search: "Which medicine?",
  appearance: "What does the pill look like?",
  indication: "What is it for?",
  dosage: "How much is each dose?",
  schedule: "When do you take it?",
  inventory: "How many do you have?",
};

interface AddMedicationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * How to resolve a same-generic duplicate: stock the new box under the
 * existing prescription, or knowingly create a second (replacement) one.
 */
type DuplicateChoice = "addToExisting" | "saveAsNew";

/** Error keys a step component already renders next to its own field. */
const INLINE_ERROR_FIELDS = new Set(["brandName", "compounds", "dosage"]);

function capitalizeWords(str: string) {
  if (!str) return "";
  return str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Two blank ingredient rows — the combo-fields' "cleared" state, mirroring
// the wizard form's initial value. A fresh array per call avoids sharing a
// mutable reference across patches.
const emptyCompounds = (): CompoundStrength[] => [
  { name: "", strength: 0 },
  { name: "", strength: 0 },
];

export function AddMedicationWizard({ open, onOpenChange }: AddMedicationWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("search");
  const showAi = useAuthGate();
  // The AI lookup is shared by every step, like the prototype's `wiz.look`:
  // a result found on step 1 can still fill in a later step.
  const lookup = useMedicineLookup();
  const addPrescriptionMutation = useAddPrescription();
  const addMedicationToPrescriptionMutation = useAddMedicationToPrescription();
  const existingPrescriptions = usePrescriptions();

  const { formState, errors, onFieldChange, patch, validateStep, clearErrors, reset: resetForm } = useAddMedicationForm();

  // Duplicate guard: a same-generic active prescription found at save time,
  // and what the user chose to do about it.
  const [duplicate, setDuplicate] = useState<Prescription | null>(null);
  const [duplicateChoice, setDuplicateChoice] = useState<DuplicateChoice | null>(null);

  const isExistingPrescription = formState.selectedPrescriptionId !== "new";
  // Phases of the prescription a brand is being added to — the selected one,
  // or the duplicate the user may redirect the save to.
  const selectedPrescriptionPhases = usePhasesForPrescription(
    isExistingPrescription ? formState.selectedPrescriptionId : duplicate?.id
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
      // The selected prescription dictates combo mode: a combination Rx
      // pre-fills the ingredient names (only the per-pill mg need entering),
      // a single-compound Rx clears any stale combo state.
      const rx = existingPrescriptions.find((p) => p.id === id);
      if (rx?.compounds && rx.compounds.length >= 2) {
        partial.isCombination = true;
        partial.compounds = rx.compounds.map((c) => ({ name: c.name, strength: 0 }));
      } else {
        partial.isCombination = false;
        partial.compounds = emptyCompounds();
      }
      if (Object.keys(partial).length > 0) patch(partial);
    }
  }, [existingPrescriptions, selectedPrescriptionPhases, onFieldChange, patch]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    lookup.clear();
    setTimeout(() => {
      resetForm();
      setStep("search");
      setConflictCheckState("idle");
      resetConflicts();
      setDuplicate(null);
      setDuplicateChoice(null);
    }, 300);
  }, [onOpenChange, resetForm, resetConflicts, lookup]);

  // Adding a brand to an existing prescription is the prototype's add-brand
  // host: brand, strength and appearance only.
  const existingRx = isExistingPrescription
    ? existingPrescriptions.find((p) => p.id === formState.selectedPrescriptionId)
    : undefined;
  const lookupGroups: LookupGroup[] = isExistingPrescription
    ? step === "search"
      ? ["brand", "strength", "appearance"]
      : step === "appearance"
        ? ["appearance"]
        : []
    : NEW_RX_LOOKUP_GROUPS[step];
  const lookupFallback = isExistingPrescription
    ? formState.brandName || existingRx?.genericName || ""
    : formState.brandName || formState.genericName;

  const handleLookupApply = ({ groups, result, option }: ApplyContext) => {
    patch(
      isExistingPrescription
        ? applyToNewBrand(groups, result, option, formState)
        : applyToNewPrescription(groups, result, option),
    );
    clearErrors();
  };

  const lookupPanel =
    lookupGroups.length > 0 ? (
      <MedicineLookupPanel
        lookup={lookup}
        groups={lookupGroups}
        compact={step !== "search"}
        fallbackQuery={lookupFallback}
        placeholder={
          existingRx
            ? `e.g. ${existingRx.genericName} or a brand name`
            : "e.g. Entresto, Vymada 100 or Dapagliflozin"
        }
        showSignIn={step === "search"}
        onApply={handleLookupApply}
      />
    ) : null;

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

  const handleSave = async (choice: DuplicateChoice | null = duplicateChoice) => {
    // Combination drugs keep `strength` as the SUM of compound strengths, so
    // the pill math (dosage / strength) stays identical to single-compound.
    const validCompounds = formState.compounds.filter(
      (c) => c.name.trim() !== "" && c.strength > 0,
    );
    const isCombo = formState.isCombination && validCompounds.length >= 2;
    const finalGenericName =
      formState.genericName ||
      (isCombo ? formatCompoundNames(validCompounds) : formState.brandName);

    const targetPrescriptionId =
      choice === "addToExisting" && duplicate ? duplicate.id : formState.selectedPrescriptionId;
    const addingToExisting = targetPrescriptionId !== "new";

    // A box added to an existing prescription, or a knowing second
    // prescription for the same drug, is a replacement: ask for the pills on
    // hand rather than silently starting the count at 0.
    const requireStock = addingToExisting || choice === "saveAsNew";
    if (!validateStep(step, { requireStock })) return;

    // Deterministic duplicate guard — independent of the AI interaction check,
    // which is skipped signed-out and on any AI error.
    if (!addingToExisting && choice === null) {
      const dup = findDuplicatePrescription(
        finalGenericName,
        existingPrescriptions.filter(isLive),
      );
      if (dup) {
        setDuplicate(dup);
        return;
      }
    }

    // Conflict check for new prescriptions (AI-driven; skip when signed out)
    if (showAi && conflictCheckState === "idle" && !addingToExisting) {
      const activeMeds = existingPrescriptions.filter((p) => p.isActive);
      if (activeMeds.length > 0) {
        setConflictCheckState("checking");
        try {
          const result = await checkInteractions({
            mode: "conflict",
            newMedication: finalGenericName,
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

    // Same resolver as the Dosage step preview; the search/dosage steps have
    // already rejected an unreadable strength or a non-positive dose.
    const dose = resolveWizardDose(formState);
    if (!dose) return;
    let { strength, unit } = dose;

    // Pill math divides the phase's dose by the brand's strength as plain
    // numbers, so a new brand must be expressed in the prescription's unit
    // (a "0.1 mg" box for a 100 mcg regimen is stored as 100 mcg).
    if (addingToExisting) {
      const phase =
        selectEffectivePhase(selectedPrescriptionPhases) ??
        selectedPrescriptionPhases.find(isLive);
      const phaseUnit = normalizeStrengthUnit(phase?.unit);
      if (phaseUnit && phaseUnit !== unit) {
        const converted = convertStrength(strength, unit, phaseUnit);
        if (converted === null) {
          toast({
            title: "Strength unit doesn't match",
            description: `This prescription is dosed in ${phaseUnit}; a ${unit} strength can't be converted.`,
            variant: "destructive",
          });
          return;
        }
        strength = converted;
        unit = phaseUnit;
      }
    }

    const compoundsForSave = isCombo ? validCompounds : undefined;
    const scheduleDosage = dose.total;
    const currentStock = parseStockInput(formState.currentStock) ?? 0;

    try {
      const refillDays = parseInt(formState.refillAlertDays) || undefined;
      const refillPills = parseInt(formState.refillAlertPills) || undefined;
      const finalBrandName = formState.brandName || capitalizeWords(formState.searchQuery);
      const finalSchedules = formState.asNeeded
        ? []
        : formState.schedules
            .filter((s) => s.time && s.daysOfWeek.length > 0)
            .map((s) => ({ ...s, dosage: scheduleDosage }));

      if (addingToExisting) {
        await addMedicationToPrescriptionMutation.mutateAsync({
          prescriptionId: targetPrescriptionId,
          brandName: finalBrandName,
          strength,
          unit,
          pillShape: formState.pillShape,
          pillColor: formState.pillColor,
          ...(formState.visualIdentification && { visualIdentification: formState.visualIdentification }),
          ...(compoundsForSave && { compounds: compoundsForSave }),
          currentStock,
          ...(refillDays !== undefined && { refillAlertDays: refillDays }),
          ...(refillPills !== undefined && { refillAlertPills: refillPills }),
        });
      } else {
        await addPrescriptionMutation.mutateAsync({
          brandName: finalBrandName,
          genericName: finalGenericName,
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
          currentStock,
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

  const saving = addPrescriptionMutation.isPending || addMedicationToPrescriptionMutation.isPending;

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) handleClose(); }} repositionInputs={false}>
      <DrawerContent data-domain="meds"
        className="flex h-[92dvh] w-full max-w-[100vw] flex-col overflow-hidden bg-panel shadow-[inset_0_3px_0_hsl(var(--meds))]"
        aria-describedby={undefined}
      >
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
        {duplicate && duplicateChoice === null && (
          <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-panel p-4">
            <div className="border border-sodium bg-sodium/10 px-3 py-2.5">
              <h3 className="mb-1 flex items-center gap-2 text-[0.9375rem] font-semibold text-sodium">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Possible duplicate
              </h3>
              <p className="mb-2 text-sm">
                You already have an active prescription for{" "}
                <span className="font-semibold">{duplicate.genericName}</span>.
                A second one would put both on your schedule, so &ldquo;take all&rdquo;
                would log a double dose.
              </p>
              <p className="text-[0.8125rem] text-muted-foreground">
                Adding to the existing prescription stocks this box as another
                brand and keeps its current schedule — change the dose there if it
                changed.
              </p>
            </div>
            <div className="mt-auto flex flex-col gap-2 pt-4">
              <Button
                onClick={() => {
                  setDuplicateChoice("addToExisting");
                  handleSave("addToExisting");
                }}
              >
                Add to existing prescription
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDuplicateChoice("saveAsNew");
                  handleSave("saveAsNew");
                }}
              >
                Save as a separate prescription
              </Button>
              <Button variant="outline" onClick={() => setDuplicate(null)}>
                Go back
              </Button>
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Header: title, step counter, Cancel (`.wiz-h`) */}
          <div className="flex flex-none items-center gap-2 px-3.5 pb-1.5 pt-2">
            <div className="min-w-0 flex-1">
              <DrawerTitle className="text-base font-semibold">
                {isExistingPrescription ? "Add medication" : "Add prescription"}
              </DrawerTitle>
              <p className="text-[0.8125rem] text-muted-foreground">
                Step {currentStepIndex + 1} of {activeSteps.length} ·{" "}
                <span data-testid="wizard-step-label">{STEP_LABELS[step]}</span>
              </p>
            </div>
            <Button variant="outline" onClick={handleClose} aria-label="Cancel and close">
              Cancel
            </Button>
          </div>

          {/* Progress segments (`.steps`) */}
          <div className="grid flex-none gap-[3px] px-3.5 pb-1" style={{ gridTemplateColumns: `repeat(${activeSteps.length}, minmax(0, 1fr))` }} aria-hidden="true">
            {activeSteps.map((s, i) => (
              <i
                key={s}
                className={cn("block h-1", i <= currentStepIndex ? "bg-meds" : "bg-foreground/14")}
              />
            ))}
          </div>

          {/* Body (`.wiz-b`) */}
          <div className="flex min-h-[300px] flex-1 flex-col gap-3.5 overflow-y-auto px-3.5 pb-4 pt-3">
            <h3 className="text-[1.0625rem] font-semibold">{STEP_QUESTIONS[step]}</h3>
            {step === "search" && (
              <SearchStep
                formState={formState}
                onFieldChange={onFieldChange}
                errors={errors}
                existingPrescriptions={existingPrescriptions}
                onSelectPrescription={handlePrescriptionSelect}
                lookup={lookupPanel}
              />
            )}
            {step !== "search" && lookupPanel}
            {step === "appearance" && (
              <AppearanceStep formState={formState} onFieldChange={onFieldChange} />
            )}
            {step === "indication" && (
              <IndicationStep formState={formState} onFieldChange={onFieldChange} />
            )}
            {step === "dosage" && (
              <DosageStep formState={formState} onFieldChange={onFieldChange} error={errors.dosage} />
            )}
            {step === "schedule" && (
              <ScheduleStep formState={formState} onFieldChange={onFieldChange} />
            )}
            {step === "inventory" && (
              <InventoryStep formState={formState} onFieldChange={onFieldChange} />
            )}
            {/* Errors the step components don't render inline. */}
            {Object.entries(errors)
              .filter(([field]) => !INLINE_ERROR_FIELDS.has(field))
              .map(([field, message]) => (
                <p key={field} role="alert" className="text-[0.8125rem] text-bp">
                  {message}
                </p>
              ))}
          </div>

          {/* Sticky footer: Back (1fr) + Next / Save (2fr) (`.wiz-f`) */}
          <div
            className={cn(
              "sticky bottom-0 z-[2] grid flex-none gap-2 border-t border-line bg-panel px-3.5 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-2.5",
              canGoBack ? "grid-cols-[1fr_2fr]" : "grid-cols-1",
            )}
          >
            {canGoBack && (
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
            )}
            {isLastStep ? (
              <Button onClick={() => handleSave()} disabled={saving}>
                {saving ? <Spinner /> : <Check aria-hidden="true" />}
                Save Medication
              </Button>
            ) : (
              <Button onClick={goNext}>
                Next
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
