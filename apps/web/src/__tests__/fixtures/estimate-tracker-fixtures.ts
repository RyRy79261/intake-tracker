import type { EntityTable } from "dexie";
import { db } from "@/lib/db";
import { makeDefecationRecord, makeUrinationRecord } from "@/__tests__/fixtures/db-fixtures";
import { ESTIMATE_TRACKERS, type EstimateRecord, type EstimateTrackerId } from "@/lib/estimate-trackers";

/**
 * Test helpers for the estimate-tracker tests, which run once per tracker
 * (`describe.each(ESTIMATE_TRACKER_IDS)`).
 */

export function makeEstimateRecord(tracker: EstimateTrackerId, overrides?: Partial<EstimateRecord>): EstimateRecord {
  return tracker === "urination" ? makeUrinationRecord(overrides) : makeDefecationRecord(overrides);
}

/** The tracker's own Dexie table. */
export function estimateTable(tracker: EstimateTrackerId): EntityTable<EstimateRecord, "id"> {
  return db[ESTIMATE_TRACKERS[tracker].table] as EntityTable<EstimateRecord, "id">;
}

/** The other tracker, to check that entries stay in their own table. */
export function otherTracker(tracker: EstimateTrackerId): EstimateTrackerId {
  return tracker === "urination" ? "defecation" : "urination";
}

/** `seedDatabase` input that puts `records` in the tracker's table. */
export function estimateSeed(tracker: EstimateTrackerId, records: EstimateRecord[]) {
  return { [ESTIMATE_TRACKERS[tracker].table]: records } as {
    urinationRecords?: EstimateRecord[];
    defecationRecords?: EstimateRecord[];
  };
}
