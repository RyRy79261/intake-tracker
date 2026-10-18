import type { DefecationRecord, UrinationRecord } from "@/lib/db";
import { DEFECATION_AMOUNT_OPTIONS, URINATION_AMOUNT_OPTIONS, type AmountOption } from "@/lib/constants";
import type { Settings } from "@/stores/settings-store";

/**
 * Estimate trackers: urination and defecation. Each is a time, an optional
 * amount estimate (small, medium, large) and an optional note. They differ
 * only in this config; the service (`estimate-tracker-service.ts`), the hooks
 * (`hooks/use-estimate-tracker.ts`), the card and the edit dialog take a
 * tracker id and read everything else from here.
 */

export const ESTIMATE_TRACKER_IDS = ["urination", "defecation"] as const;
export type EstimateTrackerId = (typeof ESTIMATE_TRACKER_IDS)[number];

/** One stored entry. The two tables hold the same shape. */
export type EstimateRecord = UrinationRecord | DefecationRecord;

export interface EstimateTracker {
  id: EstimateTrackerId;
  /** The Dexie table (and sync table) that stores it. */
  table: "urinationRecords" | "defecationRecords";
  /** Display name: card title, toasts ("Urination recorded"), dialog title. */
  label: string;
  /** The quick-log buttons and the amount Select, in order. */
  amountOptions: readonly AmountOption[];
  /** Placeholder of the note fields. */
  notePlaceholder: string;
  /** The setting that holds the details form's default amount. */
  defaultAmountKey: keyof Pick<Settings, "urinationDefaultAmount" | "defecationDefaultAmount">;
}

export const ESTIMATE_TRACKERS: Record<EstimateTrackerId, EstimateTracker> = {
  urination: {
    id: "urination",
    table: "urinationRecords",
    label: "Urination",
    amountOptions: URINATION_AMOUNT_OPTIONS,
    notePlaceholder: "e.g. colour, urgency",
    defaultAmountKey: "urinationDefaultAmount",
  },
  defecation: {
    id: "defecation",
    table: "defecationRecords",
    label: "Defecation",
    amountOptions: DEFECATION_AMOUNT_OPTIONS,
    notePlaceholder: "e.g. consistency, urgency",
    defaultAmountKey: "defecationDefaultAmount",
  },
};
