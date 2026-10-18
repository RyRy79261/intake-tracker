import type { EntityTable } from "dexie";
import { db, type HealthRecordSource } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { generateId, syncFields } from "@/lib/utils";
import { syncedWrite } from "@/lib/synced-write";
import {
  getActiveRecords,
  getRecordsBetween,
  softDeleteRecord,
  undoSoftDeleteRecord,
  updateRecord,
} from "@/lib/record-crud";
import {
  ESTIMATE_TRACKERS,
  type EstimateRecord,
  type EstimateTrackerId,
} from "@/lib/estimate-trackers";

/**
 * The estimate-tracker service: add, read, edit and delete entries of one
 * tracker (urination or defecation). Every function takes the tracker id
 * first; the table and the error wording come from its config.
 */

export interface AddEstimateInput {
  /** Defaults to now. */
  timestamp?: number;
  /** Trimmed; blank means no estimate. */
  amountEstimate?: string;
  /** Trimmed; blank means no note. */
  note?: string;
  /** How it was entered ("manual" form or "voice"); omitted = unknown. */
  source?: HealthRecordSource;
}

export interface EstimateUpdates {
  timestamp?: number;
  /** `null` clears the estimate (and the clear syncs). */
  amountEstimate?: string | null;
  /** `null` clears the note. */
  note?: string | null;
}

function tableOf(tracker: EstimateTrackerId) {
  const { table } = ESTIMATE_TRACKERS[tracker];
  // Both tables hold the same row shape.
  return { name: table, table: db[table] as EntityTable<EstimateRecord, "id"> };
}

const noun = (tracker: EstimateTrackerId) => ESTIMATE_TRACKERS[tracker].label.toLowerCase();

export async function addEstimateRecord(
  tracker: EstimateTrackerId,
  input: AddEstimateInput = {},
): Promise<ServiceResult<EstimateRecord>> {
  const { name } = tableOf(tracker);
  try {
    const amount = input.amountEstimate?.trim();
    const note = input.note?.trim();
    const record: EstimateRecord = {
      id: generateId(),
      timestamp: input.timestamp ?? Date.now(),
      ...(amount && { amountEstimate: amount }),
      ...(note && { note }),
      ...(input.source !== undefined && { source: input.source }),
      ...syncFields(),
    };
    await syncedWrite([name], (w) => w.insert(name, record));
    return ok(record);
  } catch (e) {
    return err(`Failed to add ${noun(tracker)} record`, e);
  }
}

/** Live entries, newest first, optionally capped. */
export function getEstimateRecords(tracker: EstimateTrackerId, limit?: number): Promise<EstimateRecord[]> {
  return getActiveRecords<EstimateRecord>(tableOf(tracker).table, limit);
}

/** Live entries in [startTime, endTime). */
export function getEstimateRecordsBetween(
  tracker: EstimateTrackerId,
  startTime: number,
  endTime: number,
): Promise<EstimateRecord[]> {
  return getRecordsBetween<EstimateRecord>(tableOf(tracker).table, startTime, endTime);
}

export function updateEstimateRecord(
  tracker: EstimateTrackerId,
  id: string,
  updates: EstimateUpdates,
): Promise<ServiceResult<void>> {
  const { name, table } = tableOf(tracker);
  return updateRecord<EstimateRecord>(
    table,
    name,
    id,
    updates as Partial<EstimateRecord>,
    `Failed to update ${noun(tracker)} record`,
  );
}

export function deleteEstimateRecord(tracker: EstimateTrackerId, id: string): Promise<ServiceResult<void>> {
  const { name, table } = tableOf(tracker);
  return softDeleteRecord<EstimateRecord>(table, name, id, `Failed to delete ${noun(tracker)} record`);
}

export function undoDeleteEstimateRecord(tracker: EstimateTrackerId, id: string): Promise<ServiceResult<void>> {
  const { name, table } = tableOf(tracker);
  return undoSoftDeleteRecord<EstimateRecord>(table, name, id, `Failed to undo delete ${noun(tracker)} record`);
}
