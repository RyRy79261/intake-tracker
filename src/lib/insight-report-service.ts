/**
 * CRUD for cached AI analytics insight reports (Dexie `insightReports`, v19).
 *
 * Each generated "AI Insights" summary is persisted here, giving the user a
 * history of past assessments and letting a fresh analysis optionally compare
 * against the previous one. Every write goes through `writeWithSync` so the
 * reports back up and cloud-sync like any other record.
 */

import { db, type InsightReport } from "@/lib/db";
import { ok, err, type ServiceResult } from "@/lib/service-result";
import { generateId, getDeviceId } from "@/lib/utils";
import { writeWithSync } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

/** The fields a caller supplies when persisting a freshly generated report. */
export interface NewInsightReport {
  generatedAt: number;
  rangeStart: number;
  rangeEnd: number;
  narrative: string;
  observations: string[];
  personalised: boolean;
}

/** All cached reports, active rows only, newest generated first. */
export async function getInsightReports(): Promise<InsightReport[]> {
  const rows = await db.insightReports.toArray();
  return rows
    .filter((r) => r.deletedAt === null)
    .sort((a, b) => b.generatedAt - a.generatedAt);
}

/** The most recently generated report, or null when none exist. */
export async function getLatestInsightReport(): Promise<InsightReport | null> {
  return (await getInsightReports())[0] ?? null;
}

/** Persist a freshly generated report. */
export async function saveInsightReport(
  input: NewInsightReport,
): Promise<ServiceResult<InsightReport>> {
  try {
    const now = Date.now();
    const record: InsightReport = {
      id: generateId(),
      generatedAt: input.generatedAt,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      narrative: input.narrative,
      observations: input.observations,
      personalised: input.personalised,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: getDeviceId(),
    };
    await writeWithSync("insightReports", "upsert", async () => {
      await db.insightReports.put(record);
      return record;
    });
    schedulePush();
    return ok(record);
  } catch (e) {
    return err("Failed to save insight report", e);
  }
}

/** Soft-delete a cached report. */
export async function deleteInsightReport(
  id: string,
): Promise<ServiceResult<void>> {
  try {
    const existing = await db.insightReports.get(id);
    if (!existing || existing.deletedAt !== null) return ok(undefined);
    const next: InsightReport = {
      ...existing,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await writeWithSync("insightReports", "upsert", async () => {
      await db.insightReports.put(next);
      return next;
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete insight report", e);
  }
}
