import { type IntakeRecord, type WeightRecord, type BloodPressureRecord, type EatingRecord, type UrinationRecord, type DefecationRecord, type SubstanceRecord } from "@/lib/db";
import { logicalDayKey } from "@intake/core/logical-day";

/** Unified record type for display in history */
export type UnifiedRecord =
  | { type: "intake"; record: IntakeRecord }
  | { type: "weight"; record: WeightRecord }
  | { type: "bp"; record: BloodPressureRecord }
  | { type: "eating"; record: EatingRecord }
  | { type: "urination"; record: UrinationRecord }
  | { type: "defecation"; record: DefecationRecord }
  | { type: "caffeine"; record: SubstanceRecord }
  | { type: "alcohol"; record: SubstanceRecord };

export const FILTER_TYPES = ["all", "water", "salt", "sugar", "potassium", "weight", "bp", "eating", "urination", "defecation", "caffeine", "alcohol"] as const;

export type FilterType = (typeof FILTER_TYPES)[number];

export function isFilterType(value: unknown): value is FilterType {
  return typeof value === "string" && (FILTER_TYPES as readonly string[]).includes(value);
}

/** Get timestamp from unified record */
export function getRecordTimestamp(unified: UnifiedRecord): number {
  return unified.record.timestamp;
}

/** Get record ID from unified record */
export function getRecordId(unified: UnifiedRecord): string {
  return unified.record.id;
}

const DATE_LABEL_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
};

/**
 * Group records by date for display, keyed by a label like "Tue, Nov 14, 2023".
 *
 * With `logicalDay`, a record before `dayStartHour` in `tz` is grouped under
 * the previous date, matching the dashboard's day. Without it, groups follow
 * local calendar midnight.
 */
export function groupRecordsByDate(
  records: UnifiedRecord[],
  logicalDay?: { dayStartHour: number; tz: string },
): Map<string, UnifiedRecord[]> {
  const groups = new Map<string, UnifiedRecord[]>();
  const labels = new Map<string, string>();

  for (const unified of records) {
    const ts = getRecordTimestamp(unified);
    let dateKey: string;
    if (logicalDay) {
      const key = logicalDayKey(ts, logicalDay.dayStartHour, logicalDay.tz);
      let label = labels.get(key);
      if (label === undefined) {
        const [y, m, d] = key.split("-").map(Number);
        label = new Date(y!, m! - 1, d!, 12).toLocaleDateString("en-US", DATE_LABEL_OPTIONS);
        labels.set(key, label);
      }
      dateKey = label;
    } else {
      dateKey = new Date(ts).toLocaleDateString("en-US", DATE_LABEL_OPTIONS);
    }

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(unified);
  }

  return groups;
}

/** Filter records by type */
export function filterRecords(records: UnifiedRecord[], filter: FilterType): UnifiedRecord[] {
  if (filter === "all") return records;
  if (filter === "water") return records.filter((r) => r.type === "intake" && r.record.type === "water");
  if (filter === "salt") return records.filter((r) => r.type === "intake" && r.record.type === "salt");
  if (filter === "sugar") return records.filter((r) => r.type === "intake" && r.record.type === "sugar");
  if (filter === "potassium") return records.filter((r) => r.type === "intake" && r.record.type === "potassium");
  if (filter === "caffeine") return records.filter((r) => r.type === "caffeine");
  if (filter === "alcohol") return records.filter((r) => r.type === "alcohol");
  return records.filter((r) => r.type === filter);
}
