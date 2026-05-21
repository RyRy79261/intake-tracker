"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import type { PillShape, FoodInstruction, CompoundStrength } from "@/lib/db";
import type { MedicineSearchResult } from "@/hooks/use-medicine-search";
import { logAudit } from "@/lib/audit";
import { ALL_DAYS } from "@/components/medications/add-medication-steps/types";

// --- Per-step Zod schemas ---

export const SearchStepSchema = z.object({
  brandName: z.string().min(1, "Medication name is required"),
});

export const ScheduleEntrySchema = z.object({
  time: z.string().min(1, "Time is required"),
  dosage: z.number().positive("Dosage must be positive"),
  daysOfWeek: z.array(z.number()).min(1, "Select at least one day"),
});

export const InventoryStepSchema = z.object({
  currentStock: z
    .number({ invalid_type_error: "Stock must be a number" })
    .min(0, "Stock cannot be negative"),
});

export interface ScheduleEntry {
  time: string;
  dosage: number;
  daysOfWeek: number[];
}

export interface AddMedicationFormState {
  selectedPrescriptionId: string;

  searchQuery: string;
  searchResult: MedicineSearchResult | null;
  brandName: string;
  genericName: string;
  dosageStrength: string;

  // Combination ("multi-compound") drug — e.g. sacubitril/valsartan.
  isCombination: boolean;
  compounds: CompoundStrength[];

  pillShape: PillShape;
  pillColor: string;
  visualIdentification: string;

  indication: string;
  contraindications: string[];
  warnings: string[];
  foodInstruction: FoodInstruction;
  foodNote: string;
  notes: string;

  dosageAmount: number;
  customDosage: string;
  asNeeded: boolean;

  schedules: ScheduleEntry[];

  currentStock: string;
  refillAlertDays: string;
  refillAlertPills: string;
}

const INITIAL_STATE: AddMedicationFormState = {
  selectedPrescriptionId: "new",

  searchQuery: "",
  searchResult: null,
  brandName: "",
  genericName: "",
  dosageStrength: "",

  isCombination: false,
  compounds: [
    { name: "", strength: 0 },
    { name: "", strength: 0 },
  ],

  pillShape: "round",
  pillColor: "#E91E63",
  visualIdentification: "",

  indication: "",
  contraindications: [],
  warnings: [],
  foodInstruction: "none",
  foodNote: "",
  notes: "",

  dosageAmount: 1,
  customDosage: "",
  asNeeded: false,

  schedules: [{ time: "08:30", daysOfWeek: [...ALL_DAYS], dosage: 1 }],

  currentStock: "",
  refillAlertDays: "",
  refillAlertPills: "",
};

function capitalizeWords(str: string): string {
  if (!str) return "";
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Fields whose values should be auto-capitalized.
const CAPITALIZED_FIELDS = new Set<keyof AddMedicationFormState>([
  "brandName",
  "genericName",
]);

export type WizardStep =
  | "search"
  | "appearance"
  | "indication"
  | "dosage"
  | "schedule"
  | "inventory";

export interface UseAddMedicationFormReturn {
  formState: AddMedicationFormState;
  errors: Record<string, string>;
  onFieldChange: <K extends keyof AddMedicationFormState>(
    key: K,
    value: AddMedicationFormState[K],
  ) => void;
  patch: (partial: Partial<AddMedicationFormState>) => void;
  validateStep: (step: WizardStep) => boolean;
  clearErrors: () => void;
  reset: () => void;
}

export function useAddMedicationForm(): UseAddMedicationFormReturn {
  const [formState, setFormState] = useState<AddMedicationFormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onFieldChange = useCallback(
    <K extends keyof AddMedicationFormState>(
      key: K,
      value: AddMedicationFormState[K],
    ) => {
      setFormState((prev) => {
        if (CAPITALIZED_FIELDS.has(key) && typeof value === "string") {
          return { ...prev, [key]: capitalizeWords(value) as AddMedicationFormState[K] };
        }
        return { ...prev, [key]: value };
      });
    },
    [],
  );

  const patch = useCallback((partial: Partial<AddMedicationFormState>) => {
    setFormState((prev) => ({ ...prev, ...partial }));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const reset = useCallback(() => {
    setFormState(INITIAL_STATE);
    setErrors({});
  }, []);

  const validateStep = useCallback(
    (step: WizardStep): boolean => {
      if (step === "search") {
        const name = formState.brandName || capitalizeWords(formState.searchQuery);
        const parsed = SearchStepSchema.safeParse({ brandName: name });
        if (!parsed.success) {
          const next: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const field = issue.path[0];
            if (field && typeof field === "string") next[field] = issue.message;
          }
          setErrors(next);
          logAudit(
            "validation_error",
            JSON.stringify({
              form: "medication_wizard_search",
              errors: parsed.error.flatten(),
            }).slice(0, 1000),
          );
          return false;
        }
        if (formState.isCombination) {
          const valid = formState.compounds.filter(
            (c) => c.name.trim() !== "" && c.strength > 0,
          );
          if (valid.length < 2) {
            setErrors({
              compounds:
                "Enter a name and strength for both active ingredients",
            });
            return false;
          }
        }
      }

      if (step === "schedule") {
        for (let i = 0; i < formState.schedules.length; i++) {
          const sched = formState.schedules[i];
          if (!sched) continue;
          const parsed = ScheduleEntrySchema.safeParse(sched);
          if (!parsed.success) {
            const next: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
              const field = issue.path[0];
              if (field && typeof field === "string") {
                next[field] = `Schedule ${i + 1}: ${issue.message}`;
              }
            }
            setErrors(next);
            logAudit(
              "validation_error",
              JSON.stringify({
                form: "medication_wizard_schedule",
                errors: parsed.error.flatten(),
              }).slice(0, 1000),
            );
            return false;
          }
        }
      }

      if (step === "inventory") {
        const stock = parseInt(formState.currentStock) || 0;
        const parsed = InventoryStepSchema.safeParse({ currentStock: stock });
        if (!parsed.success) {
          const next: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const field = issue.path[0];
            if (field && typeof field === "string") next[field] = issue.message;
          }
          setErrors(next);
          logAudit(
            "validation_error",
            JSON.stringify({
              form: "medication_wizard_inventory",
              errors: parsed.error.flatten(),
            }).slice(0, 1000),
          );
          return false;
        }
      }

      setErrors({});
      return true;
    },
    [formState],
  );

  return { formState, errors, onFieldChange, patch, validateStep, clearErrors, reset };
}
