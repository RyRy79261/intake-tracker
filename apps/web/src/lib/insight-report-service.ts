/**
 * CRUD for cached AI analytics insight reports (Dexie `insightReports`, v19).
 *
 * Each generated "AI Insights" summary is persisted here, giving the user a
 * history of past assessments and letting a fresh analysis optionally compare
 * against the previous one. Every write goes through `writeWithSync` so the
 * reports back up and cloud-sync like any other record.
 */

import { db, type InsightReport } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { generateId, getDeviceId } from "@/lib/utils";
import { writeWithSync } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import type {
  AnalyticsInsightsRequest,
  PriorAssessment,
} from "@intake/ai-prompts/analytics-insights";

/** The fields a caller supplies when persisting a freshly generated report. */
export interface NewInsightReport {
  generatedAt: number;
  rangeStart: number;
  rangeEnd: number;
  narrative: string;
  observations: string[];
  /** Deep-mode URLs cited via web_search. Undefined for fast-mode reports. */
  sources?: string[];
  personalised: boolean;
  /**
   * "fast" = sync Sonnet summary; "deep" = async Opus + web-search deep
   * research. Defaults to "fast" for backward-compat callers that omit it.
   */
  mode?: "fast" | "deep";
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

/**
 * The report to compare a new analysis against: the most recent one whose
 * window ended at or before `rangeStart`. The prompt presents it as an
 * *earlier* period, so a report covering a later or overlapping window would
 * make the model describe changes backwards.
 */
export function pickPreviousInsightReport(
  reports: InsightReport[],
  rangeStart: number,
): InsightReport | null {
  return (
    reports.find((r) => r.deletedAt === null && r.rangeEnd <= rangeStart) ??
    null
  );
}

export async function getPreviousInsightReport(
  rangeStart: number,
): Promise<InsightReport | null> {
  return pickPreviousInsightReport(await getInsightReports(), rangeStart);
}

/** Whether a request actually carries the user's medical profile. */
export function isPersonalisedRequest(req: AnalyticsInsightsRequest): boolean {
  return (
    (req.profile?.conditions.length ?? 0) > 0 ||
    (req.profile?.medications?.length ?? 0) > 0
  );
}

/**
 * The prior assessment to attach to a new request, or null to send none.
 *
 * A personalised report's narrative quotes the conditions and medications it
 * was built from, so it is withheld while the new request shares no medical
 * profile — otherwise turning sharing off would not stop that detail being
 * sent again.
 */
export function priorAssessmentFor(
  previous: InsightReport,
  requestIsPersonalised: boolean,
): PriorAssessment | null {
  if (previous.personalised && !requestIsPersonalised) return null;
  return {
    generatedAt: previous.generatedAt,
    rangeStart: previous.rangeStart,
    rangeEnd: previous.rangeEnd,
    summary: previous.narrative,
    observations: previous.observations,
    ...(previous.sources && previous.sources.length > 0
      ? { sources: previous.sources }
      : {}),
  };
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
      ...(input.sources && input.sources.length > 0
        ? { sources: input.sources }
        : {}),
      personalised: input.personalised,
      mode: input.mode ?? "fast",
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

/** A deep report as the polling endpoint returns it once the job completes. */
export interface ServerInsightReport {
  /** The server's insight_reports id — the same id sync pulls deliver. */
  id: string;
  generatedAt: number;
  rangeStart: number;
  rangeEnd: number;
  narrative: string;
  observations: string[];
  sources?: string[];
  personalised: boolean;
}

/**
 * Cache a deep report the server has already persisted, so it shows up on
 * this device straight away — including on local-only devices, which never
 * pull. It is written under the server's id and not queued for push: the
 * server holds the row already, and a later pull resolves to the same record.
 *
 * A row this device already has (pulled first, or deleted since) is left
 * alone, so a late poll can neither overwrite nor resurrect it.
 */
export async function cacheServerInsightReport(
  report: ServerInsightReport,
): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", db.insightReports, async () => {
      if (await db.insightReports.get(report.id)) return;
      await db.insightReports.add({
        id: report.id,
        generatedAt: report.generatedAt,
        rangeStart: report.rangeStart,
        rangeEnd: report.rangeEnd,
        narrative: report.narrative,
        observations: report.observations,
        ...(report.sources && report.sources.length > 0
          ? { sources: report.sources }
          : {}),
        personalised: report.personalised,
        mode: "deep",
        // Never newer than the server row, so the pulled copy wins any tie.
        createdAt: report.generatedAt,
        updatedAt: report.generatedAt,
        deletedAt: null,
        deviceId: getDeviceId(),
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to cache deep insight report", e);
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
