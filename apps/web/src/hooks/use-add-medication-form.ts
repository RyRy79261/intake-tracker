"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import type { PillShape, FoodInstruction, CompoundStrength, Prescription } from "@/lib/db";
import { compoundSum } from "@intake/core/compound";
import { isLive } from "@intake/core/lifecycle";
import { parseStrength } from "@intake/core/strength";
import type { MedicineSearchResult } from "@/hooks/use-medicine-search";
import { logAudit } from "@/lib/audit";
import { ALL_DAYS } from "@/components/medications/add-medication-steps/types";

// --- Per-step Zod schemas ---

export const SearchStepSchema = z.object({
  brandName: z.string().min(1, "Medication name is required"),
});

// Every time in the wizard takes the same dose (set on the Dosage step), so
// a schedule entry carries no dosage of its own — handleSave stamps the
// resolved dose onto each one. Split doses are edited per row afterwards.
export const ScheduleEntrySchema = z.object({
  time: z.string().min(1, "Time is required"),
  daysOfWeek: z.array(z.number()).min(1, "Select at least one day"),
});

export const InventoryStepSchema = z.object({
  currentStock: z
    .number({ error: "Stock must be a number" })
    .min(0, "Stock cannot be negative"),
});

export interface ScheduleEntry {
  time: string;
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

  schedules: [{ time: "08:30", daysOfWeek: [...ALL_DAYS] }],

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

/** Parse stock text; blank ⇒ `null` so callers can tell "not entered" from 0. */
export function parseStockInput(text: string): number | null {
  if (text.trim() === "") return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

export interface WizardDose {
  /** Per-pill strength — the pill-math denominator (compound sum for a combo). */
  strength: number;
  unit: string;
  /** Pills per dose. */
  pills: number;
  /** Dose in `unit`: `pills × strength`. */
  total: number;
}

/**
 * The dose the wizard will save, resolved from the form once so the Dosage
 * step's preview and handleSave can't disagree. `null` when the strength
 * can't be read; `pills` / `total` may still be ≤ 0 or NaN — validateStep
 * rejects those.
 */
export function resolveWizardDose(state: AddMedicationFormState): WizardDose | null {
  let strength: number;
  let unit: string;
  if (state.isCombination) {
    strength = compoundSum(
      state.compounds.filter((c) => c.name.trim() !== "" && c.strength > 0),
    );
    unit = "mg";
    if (!(strength > 0)) return null;
  } else {
    const parsed = parseStrength(state.dosageStrength);
    if (!parsed) return null;
    strength = parsed.value;
    unit = parsed.unit;
  }
  const pills = state.customDosage !== ""
    ? parseFloat(state.customDosage)
    : state.dosageAmount;
  const total = Math.round(pills * strength * 10000) / 10000;
  return { strength, unit, pills, total };
}

/**
 * Case-, spacing- and ingredient-order-insensitive key for a generic name, so
 * "Sacubitril/valsartan" and "Valsartan + Sacubitril" compare equal.
 */
export function normalizeGenericName(name: string): string {
  return name
    .toLowerCase()
    .split(/\s*(?:\/|\+|&|,|\band\b|\bwith\b)\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort()
    .join("/");
}

/** A live, active prescription with the same normalised generic name. */
export function findDuplicatePrescription(
  genericName: string,
  prescriptions: readonly Prescription[],
): Prescription | undefined {
  const key = normalizeGenericName(genericName);
  if (!key) return undefined;
  return prescriptions.find(
    (p) => p.isActive && isLive(p) && normalizeGenericName(p.genericName) === key,
  );
}

export interface ValidateOptions {
  /**
   * Blank stock is an error rather than 0 — set when the save stocks a
   * replacement box, where a silent 0 lets doses drive the count negative.
   */
  requireStock?: boolean;
}

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
  validateStep: (step: WizardStep, options?: ValidateOptions) => boolean;
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
    (step: WizardStep, options?: ValidateOptions): boolean => {
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
              errors: z.flattenError(parsed.error),
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
        } else if (!parseStrength(formState.dosageStrength)) {
          setErrors({
            dosageStrength:
              "Enter the strength printed on the box, e.g. 5 mg (mg, mcg, g or ml)",
          });
          return false;
        }
      }

      if (step === "dosage") {
        const dose = resolveWizardDose(formState);
        if (!dose || !Number.isFinite(dose.total) || !(dose.pills > 0)) {
          setErrors({ dosage: "Dose must be more than 0" });
          return false;
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
                errors: z.flattenError(parsed.error),
              }).slice(0, 1000),
            );
            return false;
          }
        }
      }

      if (step === "inventory") {
        const entered = parseStockInput(formState.currentStock);
        if (entered === null && options?.requireStock) {
          setErrors({
            currentStock:
              "Enter how many pills you have on hand (0 if none) so the count starts right",
          });
          return false;
        }
        const parsed = InventoryStepSchema.safeParse({ currentStock: entered ?? 0 });
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
              errors: z.flattenError(parsed.error),
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
