export interface RxEntry {
  prescriptionId: string;
  schedules: { time: string; daysOfWeek: number[]; dosage: string }[];
}

export const DAY_LABELS_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
