import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";

export type FieldChange = <K extends keyof AddMedicationFormState>(
  key: K,
  value: AddMedicationFormState[K],
) => void;

export const PILL_SHAPES: { value: AddMedicationFormState["pillShape"]; label: string }[] = [
  { value: "round", label: "Round" },
  { value: "oval", label: "Oval" },
  { value: "capsule", label: "Capsule" },
  { value: "diamond", label: "Diamond" },
  { value: "tablet", label: "Tablet" },
];

export const PRESET_COLORS = [
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#2196F3",
  "#00BCD4", "#4CAF50", "#CDDC39", "#FFC107", "#FF9800",
  "#FF5722", "#795548", "#607D8B", "#FFFFFF", "#212121",
];

export const COLOR_NAME_MAP: Record<string, string> = {
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

// Common dose multipliers relative to pill strength
export const DOSE_MULTIPLIERS = [0.25, 0.5, 1, 1.5, 2, 3];

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const DAY_LABELS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
