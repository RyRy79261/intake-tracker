import { type IntakeRecord, type WeightRecord, type BloodPressureRecord, type EatingRecord, type UrinationRecord, type DefecationRecord, type SubstanceRecord } from "@/lib/db";

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

export type FilterType = "all" | "water" | "salt" | "weight" | "bp" | "eating" | "urination" | "defecation" | "caffeine" | "alcohol";

/** Get timestamp from unified record */
export function getRecordTimestamp(unified: UnifiedRecord): number {
  return unified.record.timestamp;
}

/** Get record ID from unified record */
export function getRecordId(unified: UnifiedRecord): string {
  return unified.record.id;
}

/** Group records by date for display */
export function groupRecordsByDate(records: UnifiedRecord[]): Map<string, UnifiedRecord[]> {
  const groups = new Map<string, UnifiedRecord[]>();

  for (const unified of records) {
    const date = new Date(getRecordTimestamp(unified));
    const dateKey = date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

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
  if (filter === "caffeine") return records.filter((r) => r.type === "caffeine");
  if (filter === "alcohol") return records.filter((r) => r.type === "alcohol");
  return records.filter((r) => r.type === filter);
}
