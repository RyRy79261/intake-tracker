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
import { db } from "@intake/db/client";
import {
  insightJobs,
  insightReports,
  usersSync,
} from "@intake/db/schema";
import { generateId } from "@/lib/utils";

const SERVER_DEVICE_ID = "server-deep-batch";

export interface CreateInsightJobInput {
  userId: string;
  // The raw validated request body so we can re-run / audit later without
  // depending on Anthropic retaining the message contents past 24h.
  requestPayload: unknown;
}

export interface InsightJobRow {
  id: string;
  userId: string;
  batchId: string | null;
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

/**
 * Reserve the pending-job slot for a user BEFORE submitting to Anthropic.
 *
 * The flow at the route is:
 *   1. createInsightJob() — takes the unique-index lock, returns a job row
 *      with batchId=null.
 *   2. client.messages.batches.create() — pays for the batch.
 *   3. attachBatchToJob() — writes the real batch_id onto the row.
 *
 * Doing the DB reservation first guarantees that two concurrent submissions
 * from the same user can never both result in a paid batch (the second
 * createInsightJob raises PendingJobConflictError before any API call).
 */
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
        batchId: null,
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

/**
 * Attach the Anthropic batch_id to a previously-reserved pending job.
 * Returns true on success, false if the job is no longer pending (e.g.
 * already failed by a cleanup path).
 */
export async function attachBatchToJob(
  jobId: string,
  batchId: string,
): Promise<boolean> {
  const updated = await db
    .update(insightJobs)
    .set({ batchId })
    .where(and(eq(insightJobs.id, jobId), eq(insightJobs.status, "pending")))
    .returning({ id: insightJobs.id });
  return updated.length > 0;
}

/**
 * Delete a pending job row outright. Used as the rollback path when batch
 * submission to Anthropic fails BEFORE we have a real batch_id — the row
 * has no external side-effect to preserve and removing it frees the
 * unique-index lock immediately so the user can retry.
 */
export async function deletePendingJob(
  jobId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(insightJobs)
    .where(
      and(
        eq(insightJobs.id, jobId),
        eq(insightJobs.userId, userId),
        eq(insightJobs.status, "pending"),
      ),
    );
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
  /** URLs cited via web_search; null when the model produced none. */
  sources: string[] | null;
  personalised: boolean;
}

/**
 * Insert the freshly produced deep report into `insight_reports` and flip the
 * job to "completed". The transition is guarded by a compare-and-set on
 * `status='pending'` — the neon-http driver has no interactive transactions,
 * so we use a conditional UPDATE + RETURNING to detect lost races between
 * concurrent pollers. On a lost race we soft-delete the orphan report so it
 * doesn't surface as a duplicate in the user's history.
 *
 * Returns `null` when the CAS lost — caller should treat it as "another
 * poller already finalised this job" and just read the existing row.
 */
export async function completeInsightJob(
  jobId: string,
  report: PersistDeepReportInput,
): Promise<{ reportId: string } | null> {
  const reportId = generateId();
  const now = Date.now();
  // Insert the report first. If we lose the race below, we soft-delete it
  // so the FK on result_report_id can still resolve from the winning row,
  // and the deleted flag keeps it out of the active history view.
  await db.insert(insightReports).values({
    id: reportId,
    userId: report.userId,
    generatedAt: report.generatedAt,
    rangeStart: report.rangeStart,
    rangeEnd: report.rangeEnd,
    narrative: report.narrative,
    observations: report.observations,
    sources: report.sources,
    personalised: report.personalised,
    mode: "deep",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: SERVER_DEVICE_ID,
  });

  const updated = await db
    .update(insightJobs)
    .set({
      status: "completed",
      completedAt: now,
      resultReportId: reportId,
    })
    .where(and(eq(insightJobs.id, jobId), eq(insightJobs.status, "pending")))
    .returning({ id: insightJobs.id });

  if (updated.length === 0) {
    // Another poller flipped the job first — soft-delete the orphan to
    // keep history clean.
    await db
      .update(insightReports)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(insightReports.id, reportId));
    return null;
  }

  return { reportId };
}

/**
 * Compare-and-set: only flips a still-pending job to "failed". Returns true
 * when the caller won the race; false means another poller already marked
 * the job terminal and the caller should defer to that outcome.
 */
export async function failInsightJob(
  jobId: string,
  error: string,
): Promise<boolean> {
  const updated = await db
    .update(insightJobs)
    .set({
      status: "failed",
      completedAt: Date.now(),
      error,
    })
    .where(and(eq(insightJobs.id, jobId), eq(insightJobs.status, "pending")))
    .returning({ id: insightJobs.id });
  return updated.length > 0;
}

/** Same compare-and-set semantics as failInsightJob — see above. */
export async function expireInsightJob(jobId: string): Promise<boolean> {
  const updated = await db
    .update(insightJobs)
    .set({
      status: "expired",
      completedAt: Date.now(),
      error: "Batch exceeded the 24-hour SLA without completing.",
    })
    .where(and(eq(insightJobs.id, jobId), eq(insightJobs.status, "pending")))
    .returning({ id: insightJobs.id });
  return updated.length > 0;
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
  sources: string[] | null;
  generatedAt: number;
} | null> {
  const rows = await db
    .select({
      narrative: insightReports.narrative,
      observations: insightReports.observations,
      sources: insightReports.sources,
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
