"use client";

import { useState, useCallback } from "react";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PillIcon } from "./pill-icon";
import { useMedicineSearch, type MedicineSearchResult } from "@/hooks/use-medicine-search";
import { useAddPrescription, usePrescriptions, useAddMedicationToPrescription, usePhasesForPrescription } from "@/hooks/use-medication-queries";
import type { PillShape, FoodInstruction, Prescription, MedicationPhase } from "@/lib/db";
import { ArrowLeft, ArrowRight, Search, Loader2, Check, Plus, X } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

// --- Per-step Zod schemas (co-located per user decision) ---

const SearchStepSchema = z.object({
  brandName: z.string().min(1, "Medication name is required"),
});

const ScheduleEntrySchema = z.object({
  time: z.string().min(1, "Time is required"),
  dosage: z.number().positive("Dosage must be positive"),
  daysOfWeek: z.array(z.number()).min(1, "Select at least one day"),
});

const InventoryStepSchema = z.object({
  currentStock: z.number({ invalid_type_error: "Stock must be a number" }).min(0, "Stock cannot be negative"),
});

type WizardStep = "search" | "appearance" | "indication" | "dosage" | "schedule" | "inventory";

const STEPS: WizardStep[] = ["search", "appearance", "indication", "dosage", "schedule", "inventory"];
const STEP_LABELS: Record<WizardStep, string> = {
  search: "Search Medicine",
  appearance: "Pill Appearance",
  indication: "Indication & Notes",
  dosage: "Dosage",
  schedule: "Schedule",
  inventory: "Inventory",
};

const PILL_SHAPES: { value: PillShape; label: string }[] = [
  { value: "round", label: "Round" },
  { value: "oval", label: "Oval" },
  { value: "capsule", label: "Capsule" },
  { value: "diamond", label: "Diamond" },
  { value: "tablet", label: "Tablet" },
];

const PRESET_COLORS = [
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#2196F3",
  "#00BCD4", "#4CAF50", "#CDDC39", "#FFC107", "#FF9800",
  "#FF5722", "#795548", "#607D8B", "#FFFFFF", "#212121",
];

const COLOR_NAME_MAP: Record<string, string> = {
  pink: "#E91E63",
  magenta: "#E91E63",
  purple: "#9C27B0",
  violet: "#673AB7",
  indigo: "#3F51B5",
  blue: "#2196F3",
  cyan: "#00BCD4",
  teal: "#00BCD4",
  green: "#4CAF50",
  lime: "#CDDC39",
  yellow: "#FFC107",
  amber: "#FF9800",
  orange: "#FF9800",
  red: "#FF5722",
  brown: "#795548",
  beige: "#795548",
  tan: "#795548",
  gray: "#607D8B",
  grey: "#607D8B",
  white: "#FFFFFF",
  black: "#212121",
};

const DOSE_AMOUNTS = [0.25, 0.5, 0.75, 1, 1.5, 2];

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_LABELS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface ScheduleEntry {
  time: string;
  dosage: number;
  daysOfWeek: number[];
}

interface AddMedicationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function capitalizeWords(str: string) {
  if (!str) return "";
  return str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function AddMedicationWizard({ open, onOpenChange }: AddMedicationWizardProps) {
  const [step, setStep] = useState<WizardStep>("search");
  const searchMutation = useMedicineSearch();
  const addPrescriptionMutation = useAddPrescription();
  const addMedicationToPrescriptionMutation = useAddMedicationToPrescription();
  const existingPrescriptions = usePrescriptions();

  // Form state
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string>("new");
  const isExistingPrescription = selectedPrescriptionId !== "new";
  const selectedPrescriptionPhases = usePhasesForPrescription(
    isExistingPrescription ? selectedPrescriptionId : undefined
  );

  // Dynamic steps: skip indication when assigning to existing prescription
  const activeSteps = isExistingPrescription
    ? STEPS.filter(s => s !== "indication")
    : STEPS;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<MedicineSearchResult | null>(null);
  const [brandName, setBrandName] = useState("");
  const [genericName, setGenericName] = useState("");
  const [dosageStrength, setDosageStrength] = useState("");

  const [pillShape, setPillShape] = useState<PillShape>("round");
  const [pillColor, setPillColor] = useState("#E91E63");
  const [visualIdentification, setVisualIdentification] = useState("");

  const [indication, setIndication] = useState("");
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [foodInstruction, setFoodInstruction] = useState<FoodInstruction>("none");
  const [foodNote, setFoodNote] = useState("");
  const [notes, setNotes] = useState("");

  const [dosageAmount, setDosageAmount] = useState(1);
  const [customDosage, setCustomDosage] = useState("");

  const [schedules, setSchedules] = useState<ScheduleEntry[]>([
    { time: "08:30", daysOfWeek: [...ALL_DAYS], dosage: 1 },
  ]);

  const [currentStock, setCurrentStock] = useState("");
  const [refillAlertDays, setRefillAlertDays] = useState("");
  const [refillAlertPills, setRefillAlertPills] = useState("");

  const resetForm = useCallback(() => {
    setStep("search");
    setSelectedPrescriptionId("new");
    setSearchQuery("");
    setSearchResult(null);
    setBrandName("");
    setGenericName("");
    setDosageStrength("");
    setPillShape("round");
    setPillColor("#E91E63");
    setVisualIdentification("");
    setIndication("");
    setContraindications([]);
    setWarnings([]);
    setFoodInstruction("none");
    setFoodNote("");
    setNotes("");
    setDosageAmount(1);
    setCustomDosage("");
    setSchedules([{ time: "08:30", daysOfWeek: [...ALL_DAYS], dosage: 1 }]);
    setCurrentStock("");
    setRefillAlertDays("");
    setRefillAlertPills("");
  }, []);

  // Pre-populate fields from existing prescription's active phase
  const handlePrescriptionSelect = useCallback((id: string) => {
    setSelectedPrescriptionId(id);
    if (id !== "new") {
      const activePhase = selectedPrescriptionPhases.find((p: MedicationPhase) => p.status === "active");
      if (activePhase) {
        setFoodInstruction(activePhase.foodInstruction);
        if (activePhase.foodNote) setFoodNote(activePhase.foodNote);
      }
    }
  }, [selectedPrescriptionPhases]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(resetForm, 300);
  }, [onOpenChange, resetForm]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
    try {
      const result = await searchMutation.mutateAsync(searchQuery.trim());
      setSearchResult(result);
      
      if (!brandName) {
        setBrandName(capitalizeWords(searchQuery.trim()));
      }
      
      if (result.genericName) setGenericName(capitalizeWords(result.genericName));
      // Auto-select dosage strength from search query (e.g., "Eliquis 5mg" -> select "5mg")
      if (result.dosageStrengths.length > 0) {
        const doseMatch = searchQuery.match(/(\d+(?:\.\d+)?)\s*mg/i);
        if (doseMatch && doseMatch[1]) {
          const queryDose = doseMatch[1];
          const matchingStrength = result.dosageStrengths.find(s =>
            s.toLowerCase().includes(queryDose + "mg") || s.toLowerCase().includes(queryDose + " mg")
          );
          setDosageStrength(matchingStrength ?? result.dosageStrengths[0] ?? "");
        } else if (result.dosageStrengths[0]) {
          setDosageStrength(result.dosageStrengths[0]);
        }
      }
      if (result.commonIndications.length > 0) setIndication(result.commonIndications.join(", "));
      if (result.contraindications) setContraindications(result.contraindications);
      if (result.warnings) setWarnings(result.warnings);
      if (result.visualIdentification) setVisualIdentification(result.visualIdentification);
      if (result.foodInstruction) setFoodInstruction(result.foodInstruction);
      if (result.foodNote) setFoodNote(result.foodNote);
      if (result.pillColor) {
        const hex = COLOR_NAME_MAP[result.pillColor.toLowerCase()];
        if (hex) setPillColor(hex);
      }
      if (result.pillShape) {
        const shape = result.pillShape.toLowerCase() as PillShape;
        if (PILL_SHAPES.some((s) => s.value === shape)) setPillShape(shape);
      }
    } catch {
      // error is in searchMutation.error
    }
  };

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateCurrentStep = (): boolean => {
    if (step === "search") {
      const name = brandName || capitalizeWords(searchQuery);
      const parsed = SearchStepSchema.safeParse({ brandName: name });
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (field && typeof field === "string") errors[field] = issue.message;
        }
        setFieldErrors(errors);
        logAudit("validation_error", JSON.stringify({ form: "medication_wizard_search", errors: parsed.error.flatten() }).slice(0, 100));
        return false;
      }
    }
    if (step === "schedule") {
      for (let i = 0; i < schedules.length; i++) {
        const sched = schedules[i];
        if (!sched) continue;
        const parsed = ScheduleEntrySchema.safeParse(sched);
        if (!parsed.success) {
          const errors: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const field = issue.path[0];
            if (field && typeof field === "string") errors[field] = `Schedule ${i + 1}: ${issue.message}`;
          }
          setFieldErrors(errors);
          logAudit("validation_error", JSON.stringify({ form: "medication_wizard_schedule", errors: parsed.error.flatten() }).slice(0, 100));
          return false;
        }
      }
    }
    if (step === "inventory") {
      const stock = parseInt(currentStock) || 0;
      const parsed = InventoryStepSchema.safeParse({ currentStock: stock });
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (field && typeof field === "string") errors[field] = issue.message;
        }
        setFieldErrors(errors);
        logAudit("validation_error", JSON.stringify({ form: "medication_wizard_inventory", errors: parsed.error.flatten() }).slice(0, 100));
        return false;
      }
    }
    setFieldErrors({});
    return true;
  };

  const currentStepIndex = activeSteps.indexOf(step);
  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < activeSteps.length - 1;
  const isLastStep = currentStepIndex === activeSteps.length - 1;

  const goBack = () => {
    setFieldErrors({});
    const prev = activeSteps[currentStepIndex - 1];
    if (canGoBack && prev) setStep(prev);
  };

  const goNext = () => {
    if (!validateCurrentStep()) return;
    const next = activeSteps[currentStepIndex + 1];
    if (canGoNext && next) setStep(next);
  };

  const handleSave = async () => {
    if (!validateCurrentStep()) return;

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

    const { strength, unit } = parseStrength(dosageStrength);
    const finalDosage = customDosage ? parseFloat(customDosage) : dosageAmount;
    const scheduleDosage = (finalDosage || 1) * strength;

    try {
      const refillDays = parseInt(refillAlertDays) || undefined;
      const refillPills = parseInt(refillAlertPills) || undefined;

      if (selectedPrescriptionId !== "new") {
        await addMedicationToPrescriptionMutation.mutateAsync({
          prescriptionId: selectedPrescriptionId,
          brandName: brandName || capitalizeWords(searchQuery),
          strength,
          unit,
          pillShape,
          pillColor,
          ...(visualIdentification && { visualIdentification }),
          foodInstruction,
          ...(foodNote && { foodNote }),
          currentStock: parseInt(currentStock) || 0,
          ...(refillDays !== undefined && { refillAlertDays: refillDays }),
          ...(refillPills !== undefined && { refillAlertPills: refillPills }),
          schedules: schedules.filter(s => s.time && s.daysOfWeek.length > 0).map(s => ({ ...s, dosage: scheduleDosage }))
        });
      } else {
        await addPrescriptionMutation.mutateAsync({
          brandName: brandName || capitalizeWords(searchQuery),
          genericName: genericName || brandName,
          strength,
          unit,
          pillShape,
          pillColor,
          ...(visualIdentification && { visualIdentification }),
          indication,
          ...(contraindications.length > 0 && { contraindications }),
          ...(warnings.length > 0 && { warnings }),
          foodInstruction,
          ...(foodNote && { foodNote }),
          currentStock: parseInt(currentStock) || 0,
          ...(refillDays !== undefined && { refillAlertDays: refillDays }),
          ...(refillPills !== undefined && { refillAlertPills: refillPills }),
          ...(notes && { notes }),
          schedules: schedules.filter(s => s.time && s.daysOfWeek.length > 0).map(s => ({ ...s, dosage: scheduleDosage }))
        });
      }
    } catch (err: unknown) {
      console.error(err);
    }

    handleClose();
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) handleClose(); }} repositionInputs={false}>
      <DrawerContent className="w-full max-w-[100vw] overflow-hidden max-h-[90dvh]">
        <div className="p-4 px-5">
          {/* Progress */}
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
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onSearch={handleSearch}
                isSearching={searchMutation.isPending}
                result={searchResult}
                {...(searchMutation.error?.message && { error: searchMutation.error.message })}
                brandName={brandName}
                onBrandNameChange={(v) => setBrandName(capitalizeWords(v))}
                genericName={genericName}
                onGenericNameChange={(v) => setGenericName(capitalizeWords(v))}
                dosageStrength={dosageStrength}
                onDosageStrengthChange={setDosageStrength}
                selectedPrescriptionId={selectedPrescriptionId}
                onSelectedPrescriptionIdChange={handlePrescriptionSelect}
                existingPrescriptions={existingPrescriptions}
                fieldErrors={fieldErrors}
              />
            )}

            {step === "appearance" && (
              <AppearanceStep
                shape={pillShape}
                onShapeChange={setPillShape}
                color={pillColor}
                onColorChange={setPillColor}
                visualIdentification={visualIdentification}
                onVisualIdentificationChange={setVisualIdentification}
              />
            )}

            {step === "indication" && (
              <IndicationStep
                indication={indication}
                onIndicationChange={setIndication}
                contraindications={contraindications}
                warnings={warnings}
                foodInstruction={foodInstruction}
                onFoodInstructionChange={setFoodInstruction}
                foodNote={foodNote}
                onFoodNoteChange={setFoodNote}
                notes={notes}
                onNotesChange={setNotes}
                isExistingPrescription={selectedPrescriptionId !== "new"}
              />
            )}

            {step === "dosage" && (
              <DosageStep
                dosageAmount={dosageAmount}
                onDosageAmountChange={setDosageAmount}
                customDosage={customDosage}
                onCustomDosageChange={setCustomDosage}
                dosageStrength={dosageStrength}
              />
            )}

            {step === "schedule" && (
              <ScheduleStep
                schedules={schedules}
                onSchedulesChange={setSchedules}
              />
            )}

            {step === "inventory" && (
              <InventoryStep
                currentStock={currentStock}
                onCurrentStockChange={setCurrentStock}
                refillAlertDays={refillAlertDays}
                onRefillAlertDaysChange={setRefillAlertDays}
                refillAlertPills={refillAlertPills}
                onRefillAlertPillsChange={setRefillAlertPills}
              />
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

// ── Step Components ──────────────────────────────────────────

function SearchStep({
  query, onQueryChange, onSearch, isSearching, result, error,
  brandName, onBrandNameChange, genericName, onGenericNameChange,
  dosageStrength, onDosageStrengthChange,
  selectedPrescriptionId, onSelectedPrescriptionIdChange,
  existingPrescriptions, fieldErrors = {},
}: {
  query: string; onQueryChange: (v: string) => void;
  onSearch: () => void; isSearching: boolean;
  result: MedicineSearchResult | null; error?: string;
  brandName: string; onBrandNameChange: (v: string) => void;
  genericName: string; onGenericNameChange: (v: string) => void;
  dosageStrength: string; onDosageStrengthChange: (v: string) => void;
  selectedPrescriptionId: string; onSelectedPrescriptionIdChange: (v: string) => void;
  existingPrescriptions: Prescription[];
  fieldErrors?: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      {existingPrescriptions.length > 0 && (
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Assign to prescription</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={selectedPrescriptionId}
            onChange={(e) => onSelectedPrescriptionIdChange(e.target.value)}
          >
            <option value="new">Create new prescription</option>
            {existingPrescriptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.genericName}{p.indication ? ` - ${p.indication}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label className="text-sm font-medium mb-1.5 block">Search medication</Label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Aviolix, Clopidogrel..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLElement).blur();
                onSearch();
              }
            }}
          />
          <Button
            onClick={onSearch}
            disabled={isSearching || !query.trim()}
            size="icon"
            className="shrink-0 bg-teal-600 hover:bg-teal-700"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      {result && (
        <div className="rounded-lg bg-teal-50 dark:bg-teal-950/30 p-3 text-sm space-y-1">
          <p className="font-medium text-teal-700 dark:text-teal-300">Found: {result.genericName}</p>
          {result.isGenericFallback && (
            <div className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-1 rounded text-xs mt-1 mb-2 border border-amber-200 dark:border-amber-800">
              Could not find physical details for that specific brand. Showing appearance for the generic equivalent.
            </div>
          )}
          {result.drugClass && <p className="text-xs text-muted-foreground">Class: {result.drugClass}</p>}
          {result.localAlternatives && result.localAlternatives.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Local: {result.localAlternatives.join(", ")}
            </p>
          )}
          {result.dosageStrengths.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Strengths: {result.dosageStrengths.join(", ")}
            </p>
          )}
          {result.pillDescription && (
            <p className="text-xs text-muted-foreground">
              Appearance: {result.pillDescription}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3 pt-2">
        <div>
          <Label className="text-sm mb-1.5 block">Brand name</Label>
          <Input value={brandName} onChange={(e) => onBrandNameChange(e.target.value)} placeholder="e.g. Aviolix" />
          {fieldErrors.brandName && (
            <p className="text-sm text-destructive mt-1">{fieldErrors.brandName}</p>
          )}
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">Active ingredient</Label>
          <Input value={genericName} onChange={(e) => onGenericNameChange(e.target.value)} placeholder="e.g. Clopidogrel" />
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">Dosage strength</Label>
          <Input value={dosageStrength} onChange={(e) => onDosageStrengthChange(e.target.value)} placeholder="e.g. 75mg" />
          {result && result.dosageStrengths.length > 1 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {result.dosageStrengths.map((s) => (
                <button
                  key={s}
                  onClick={() => onDosageStrengthChange(s)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full border transition-colors",
                    dosageStrength === s
                      ? "bg-teal-100 border-teal-300 dark:bg-teal-900 dark:border-teal-700"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AppearanceStep({
  shape, onShapeChange, color, onColorChange,
  visualIdentification, onVisualIdentificationChange,
}: {
  shape: PillShape; onShapeChange: (v: PillShape) => void;
  color: string; onColorChange: (v: string) => void;
  visualIdentification: string; onVisualIdentificationChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-center py-4">
        <PillIcon shape={shape} color={color} size={80} />
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Shape</Label>
        <div className="flex gap-2 flex-wrap">
          {PILL_SHAPES.map((s) => (
            <button
              key={s.value}
              onClick={() => onShapeChange(s.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors min-w-[60px]",
                shape === s.value
                  ? "bg-teal-50 border-teal-300 dark:bg-teal-950/40 dark:border-teal-700"
                  : "border-border hover:bg-muted"
              )}
            >
              <PillIcon shape={s.value} color={color} size={28} />
              <span className="text-[10px] font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">Color</Label>
        <div className="flex gap-2 flex-wrap px-0.5 py-0.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              className={cn(
                "w-8 h-8 rounded-full border-2 transition-all",
                color === c ? "border-teal-500 scale-110" : "border-transparent hover:scale-105",
                c === "#FFFFFF" && "border-gray-300"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Label className="text-xs">Custom:</Label>
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer"
          />
          <span className="text-xs text-muted-foreground">{color}</span>
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-1.5 block">Visual Identification Details</Label>
        <Textarea
          value={visualIdentification}
          onChange={(e) => onVisualIdentificationChange(e.target.value)}
          placeholder="e.g. Scored on one side, '10' imprinted on the other"
          rows={2}
        />
        <p className="text-xs text-muted-foreground mt-1">Optional. Markings, imprints, or coating details.</p>
      </div>
    </div>
  );
}

function IndicationStep({
  indication, onIndicationChange,
  contraindications, warnings,
  foodInstruction, onFoodInstructionChange,
  foodNote, onFoodNoteChange,
  notes, onNotesChange,
  isExistingPrescription = false,
}: {
  indication: string; onIndicationChange: (v: string) => void;
  contraindications: string[]; warnings: string[];
  foodInstruction: FoodInstruction; onFoodInstructionChange: (v: FoodInstruction) => void;
  foodNote: string; onFoodNoteChange: (v: string) => void;
  notes: string; onNotesChange: (v: string) => void;
  isExistingPrescription?: boolean;
}) {
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
            <Label className="text-sm font-medium mb-1.5 block">What is this medication for?</Label>
            <Textarea
              value={indication}
              onChange={(e) => onIndicationChange(e.target.value)}
              placeholder="e.g. Acute Myocardial Infarction, STEMI"
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
              onClick={() => onFoodInstructionChange(opt.value)}
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
            onChange={(e) => onFoodNoteChange(e.target.value)}
            placeholder={`e.g. Take ${foodInstruction} eating with water`}
          />
        </div>
      )}

      <div>
        <Label className="text-sm font-medium mb-1.5 block">Additional notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="e.g. Must cut pills in half"
          rows={2}
        />
      </div>
    </div>
  );
}

function DosageStep({
  dosageAmount, onDosageAmountChange,
  customDosage, onCustomDosageChange,
  dosageStrength,
}: {
  dosageAmount: number; onDosageAmountChange: (v: number) => void;
  customDosage: string; onCustomDosageChange: (v: string) => void;
  dosageStrength: string;
}) {
  return (
    <div className="space-y-4">
      {dosageStrength && (
        <p className="text-sm text-muted-foreground">
          Strength: <span className="font-medium text-foreground">{dosageStrength}</span>
        </p>
      )}

      <div>
        <Label className="text-sm font-medium mb-2 block">How many pills per dose?</Label>
        <div className="grid grid-cols-3 gap-2">
          {DOSE_AMOUNTS.map((amount) => (
            <button
              key={amount}
              onClick={() => { onDosageAmountChange(amount); onCustomDosageChange(""); }}
              className={cn(
                "py-3 rounded-lg border text-sm font-medium transition-colors",
                dosageAmount === amount && !customDosage
                  ? "bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-950/40 dark:border-teal-700 dark:text-teal-300"
                  : "border-border hover:bg-muted"
              )}
            >
              {amount} pill{amount !== 1 ? "s" : ""}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm mb-1.5 block">Custom amount</Label>
        <Input
          type="number"
          step="0.25"
          min="0.25"
          value={customDosage}
          onChange={(e) => onCustomDosageChange(e.target.value)}
          placeholder="Enter custom pill count"
        />
      </div>
    </div>
  );
}

function ScheduleStep({
  schedules, onSchedulesChange,
}: {
  schedules: ScheduleEntry[]; onSchedulesChange: (v: ScheduleEntry[]) => void;
}) {
  const updateSchedule = (index: number, updates: Partial<ScheduleEntry>) => {
    const next = [...schedules];
    const existing = next[index];
    if (existing) {
      next[index] = { ...existing, ...updates };
      onSchedulesChange(next);
    }
  };

  const addScheduleEntry = () => {
    onSchedulesChange([...schedules, { time: "20:30", daysOfWeek: [...ALL_DAYS], dosage: 1 }]);
  };

  const removeSchedule = (index: number) => {
    if (schedules.length <= 1) return;
    onSchedulesChange(schedules.filter((_, i) => i !== index));
  };

  const toggleDay = (schedIndex: number, day: number) => {
    const sched = schedules[schedIndex];
    if (!sched) return;
    const days = sched.daysOfWeek.includes(day)
      ? sched.daysOfWeek.filter((d) => d !== day)
      : [...sched.daysOfWeek, day].sort();
    updateSchedule(schedIndex, { daysOfWeek: days });
  };

  return (
    <div className="space-y-4">
      {schedules.map((sched, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Schedule {i + 1}</Label>
            {schedules.length > 1 && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeSchedule(i)}>
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1 block">Time</Label>
            <Input
              type="time"
              value={sched.time}
              onChange={(e) => updateSchedule(i, { time: e.target.value })}
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Days</Label>
            <div className="flex gap-1">
              {DAY_LABELS_SHORT.map((label, dayIndex) => (
                <button
                  key={dayIndex}
                  onClick={() => toggleDay(i, dayIndex)}
                  className={cn(
                    "flex-1 py-1.5 rounded text-xs font-medium transition-colors",
                    sched.daysOfWeek.includes(dayIndex)
                      ? "bg-teal-600 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={addScheduleEntry} className="w-full gap-2">
        <Plus className="w-4 h-4" />
        Add another schedule
      </Button>
    </div>
  );
}

function InventoryStep({
  currentStock, onCurrentStockChange,
  refillAlertDays, onRefillAlertDaysChange,
  refillAlertPills, onRefillAlertPillsChange,
}: {
  currentStock: string; onCurrentStockChange: (v: string) => void;
  refillAlertDays: string; onRefillAlertDaysChange: (v: string) => void;
  refillAlertPills: string; onRefillAlertPillsChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-1.5 block">Current stock (pills on hand)</Label>
        <Input
          type="number"
          min="0"
          value={currentStock}
          onChange={(e) => onCurrentStockChange(e.target.value)}
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
              onChange={(e) => onRefillAlertDaysChange(e.target.value)}
              placeholder="e.g. 7 (days)"
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Or alert when pills remaining reaches</Label>
            <Input
              type="number"
              min="0"
              value={refillAlertPills}
              onChange={(e) => onRefillAlertPillsChange(e.target.value)}
              placeholder="e.g. 10 (pills)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
