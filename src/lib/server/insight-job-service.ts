/**
 * Server-side CRUD for `insight_jobs` — async deep-research batch jobs.
 *
 * Each row represents one Anthropic Message Batches submission for the deep
 * analytics summary. The lifecycle is:
 *
 *   pending  →  completed  (batch succeeded, result_report_id points at the
 *                            persisted insight_reports row)
 *   pending  →  failed     (batch errored, server-side validation rejected
 *                            the tool output, or Anthropic returned a
 *                            non-success individual result)
 *   pending  →  expired    (24h elapsed without a terminal state)
 *
 * Server-only — never imported by browser bundles. The polling endpoint
 * (GET /api/analytics/insights/jobs/:id) is the only place that mutates
 * a row's status after creation.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import {
  insightJobs,
  insightReports,
  usersSync,
} from "@/db/schema";
import { generateId } from "@/lib/utils";

const SERVER_DEVICE_ID = "server-deep-batch";

export interface CreateInsightJobInput {
  userId: string;
  batchId: string;
  // The raw validated request body so we can re-run / audit later without
  // depending on Anthropic retaining the message contents past 24h.
  requestPayload: unknown;
}

export interface InsightJobRow {
  id: string;
  userId: string;
  batchId: string;
  status: "pending" | "completed" | "failed" | "expired";
  requestPayload: unknown;
  resultReportId: string | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}

/**
 * Insert a pending job row. The partial unique index
 * `insight_jobs_one_pending_per_user_uq` rejects a second pending row for
 * the same user — surface that as a typed error so the route can return 409.
 */
export class PendingJobConflictError extends Error {
  constructor() {
    super("A deep analysis is already running for this user.");
    this.name = "PendingJobConflictError";
  }
}

export async function createInsightJob(
  input: CreateInsightJobInput,
): Promise<InsightJobRow> {
  // Mirror the pattern in sync/push/route.ts — ensure the user_id FK target
  // exists before the dependent insert, because Neon Auth's user replication
  // can lag on preview branches.
  await db
    .insert(usersSync)
    .values({ id: input.userId })
    .onConflictDoNothing();

  const id = generateId();
  const now = Date.now();
  try {
    const [row] = await db
      .insert(insightJobs)
      .values({
        id,
        userId: input.userId,
        batchId: input.batchId,
        status: "pending",
        requestPayload: input.requestPayload as object,
        createdAt: now,
      })
      .returning();
    return row as InsightJobRow;
  } catch (e) {
    // Postgres unique_violation surfaces as code 23505 via the Neon driver;
    // the message includes the constraint name so we can route the conflict
    // path cleanly.
    if (
      e instanceof Error &&
      /insight_jobs_one_pending_per_user_uq/.test(e.message)
    ) {
      throw new PendingJobConflictError();
    }
    throw e;
  }
}

export async function getInsightJob(
  jobId: string,
  userId: string,
): Promise<InsightJobRow | null> {
  const rows = await db
    .select()
    .from(insightJobs)
    .where(and(eq(insightJobs.id, jobId), eq(insightJobs.userId, userId)))
    .limit(1);
  return (rows[0] as InsightJobRow | undefined) ?? null;
}

export interface PersistDeepReportInput {
  userId: string;
  generatedAt: number;
  rangeStart: number;
  rangeEnd: number;
  narrative: string;
  observations: string[];
  personalised: boolean;
}

/**
 * Insert the freshly produced deep report into `insight_reports` and flip the
 * job to "completed", in a single atomic step the polling endpoint can call.
 * The row is stamped with `device_id = "server-deep-batch"` so the client's
 * sync pull recognises it as a foreign-device write rather than its own.
 */
export async function completeInsightJob(
  jobId: string,
  report: PersistDeepReportInput,
): Promise<{ reportId: string }> {
  const reportId = generateId();
  const now = Date.now();
  await db.insert(insightReports).values({
    id: reportId,
    userId: report.userId,
    generatedAt: report.generatedAt,
    rangeStart: report.rangeStart,
    rangeEnd: report.rangeEnd,
    narrative: report.narrative,
    observations: report.observations,
    personalised: report.personalised,
    mode: "deep",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: SERVER_DEVICE_ID,
  });
  await db
    .update(insightJobs)
    .set({
      status: "completed",
      completedAt: now,
      resultReportId: reportId,
    })
    .where(eq(insightJobs.id, jobId));
  return { reportId };
}

export async function failInsightJob(
  jobId: string,
  error: string,
): Promise<void> {
  await db
    .update(insightJobs)
    .set({
      status: "failed",
      completedAt: Date.now(),
      error,
    })
    .where(eq(insightJobs.id, jobId));
}

export async function expireInsightJob(jobId: string): Promise<void> {
  await db
    .update(insightJobs)
    .set({
      status: "expired",
      completedAt: Date.now(),
      error: "Batch exceeded the 24-hour SLA without completing.",
    })
    .where(eq(insightJobs.id, jobId));
}

/**
 * Fetch the persisted report referenced by a completed job. Used by the
 * polling endpoint to echo the result back to the client without making it
 * wait for the next sync pull.
 */
export async function getReportForJob(
  resultReportId: string,
  userId: string,
): Promise<{
  narrative: string;
  observations: string[];
  generatedAt: number;
} | null> {
  const rows = await db
    .select({
      narrative: insightReports.narrative,
      observations: insightReports.observations,
      generatedAt: insightReports.generatedAt,
    })
    .from(insightReports)
    .where(
      and(
        eq(insightReports.id, resultReportId),
        eq(insightReports.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
