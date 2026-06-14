import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { apiFetch } from "@/lib/api-fetch";
import {
  buildAnalyticsSnapshot,
  snapshotIsEmpty,
  type IntakeGoals,
} from "@/lib/analytics-snapshot";
import {
  getInsightReports,
  getLatestInsightReport,
  saveInsightReport,
} from "@/lib/insight-report-service";
import { schedulePull } from "@/lib/sync-engine";
import type { PriorAssessment } from "@intake/ai-prompts/analytics-insights";
import type { TimeRange } from "@intake/types/analytics";
import type { InsightReport } from "@/lib/db";

export interface InsightsResult {
  narrative: string;
  observations: string[];
  sources?: string[];
  generatedAt: number;
}

/** Thrown before any network call when the requested window has nothing to summarise. */
export class NotEnoughDataError extends Error {
  constructor() {
    super("Not enough tracked data to generate insights.");
    this.name = "NotEnoughDataError";
  }
}

interface GenerateInsightsInput {
  range: TimeRange;
  goals: IntakeGoals;
  /** User-reported conditions — pass only when the user has opted in. */
  conditions?: string[];
  /** Include active medications — pass only when the user has opted in. */
  includeMedications?: boolean;
  /**
   * Attach the most recent cached report so the AI can compare periods.
   * Pass only when the user has opted in — prior summaries are free text.
   */
  includePrevious?: boolean;
  /**
   * Which optional trackers (sugar, potassium) are currently enabled in
   * settings. Disabled trackers are dropped from the snapshot entirely.
   */
  enabledTrackers?: { sugar: boolean; potassium: boolean };
}

/** Live history of cached insight reports, newest first. */
export function useInsightReports(): InsightReport[] {
  return useLiveQuery(getInsightReports, [], []);
}

/**
 * Builds the analytics snapshot locally and asks the server to turn it into an
 * AI narrative. The caller triggers this explicitly (a button), so cost is
 * bounded by user intent rather than scheduled traffic. A successful result is
 * persisted to the `insightReports` cache.
 */
export function useGenerateInsights() {
  return useMutation<InsightsResult, Error, GenerateInsightsInput>({
    mutationFn: async ({
      range,
      goals,
      conditions,
      includeMedications,
      includePrevious,
      enabledTrackers,
    }) => {
      const snapshot = await buildAnalyticsSnapshot(
        range,
        goals,
        conditions,
        includeMedications,
        enabledTrackers,
      );
      if (snapshotIsEmpty(snapshot)) {
        throw new NotEnoughDataError();
      }

      if (includePrevious) {
        const previous = await getLatestInsightReport();
        if (previous) {
          const priorAssessment: PriorAssessment = {
            generatedAt: previous.generatedAt,
            rangeStart: previous.rangeStart,
            rangeEnd: previous.rangeEnd,
            summary: previous.narrative,
            observations: previous.observations,
            ...(previous.sources && previous.sources.length > 0
              ? { sources: previous.sources }
              : {}),
          };
          snapshot.priorAssessments = [priorAssessment];
        }
      }

      const res = await apiFetch("/api/analytics/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot),
      });

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // Non-JSON body — caught by the validation below.
      }

      if (!res.ok) {
        const message =
          body &&
          typeof body === "object" &&
          typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Failed to generate insights";
        throw new Error(message);
      }

      // A malformed 200 must fail loudly, not be cached as a blank insight.
      if (
        !body ||
        typeof body !== "object" ||
        typeof (body as InsightsResult).narrative !== "string" ||
        !Array.isArray((body as InsightsResult).observations)
      ) {
        throw new Error("The insights service returned a malformed response.");
      }

      const result = body as InsightsResult;
      const insight: InsightsResult = {
        narrative: result.narrative,
        observations: result.observations,
        ...(Array.isArray(result.sources) && result.sources.length > 0
          ? { sources: result.sources }
          : {}),
        generatedAt:
          typeof result.generatedAt === "number"
            ? result.generatedAt
            : Date.now(),
      };

      // Persist to the cache. A storage failure must not discard the result
      // the user just paid tokens for, so swallow it here.
      try {
        await saveInsightReport({
          generatedAt: insight.generatedAt,
          rangeStart: range.start,
          rangeEnd: range.end,
          narrative: insight.narrative,
          observations: insight.observations,
          personalised:
            (conditions !== undefined && conditions.length > 0) ||
            includeMedications === true,
          mode: "fast",
        });
      } catch (cacheError) {
        console.warn("Failed to cache insight report:", cacheError);
      }

      return insight;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Deep-research async job: submit, then poll until the batch completes.
//
// The job state lives on the server (Postgres `insight_jobs`); the client
// just keeps the jobId in localStorage so polling survives a tab close /
// reload. On completion the server has already persisted the report to
// `insight_reports`; we trigger a sync pull so it shows up in the local
// Dexie cache without waiting for the regular sync cycle.
// ─────────────────────────────────────────────────────────────────────────

const PENDING_DEEP_JOB_KEY = "insight-deep-job-pending";
const DEEP_POLL_INTERVAL_MS = 30_000;

interface StoredPendingJob {
  jobId: string;
  startedAt: number;
}

interface DeepJobInput {
  range: TimeRange;
  goals: IntakeGoals;
  conditions?: string[];
  includeMedications?: boolean;
  includePrevious?: boolean;
  /** Which optional trackers are currently enabled. */
  enabledTrackers?: { sugar: boolean; potassium: boolean };
}

interface DeepJobPendingState {
  status: "pending";
  jobId: string;
  startedAt: number;
}

interface DeepJobCompletedState {
  status: "completed";
  jobId: string;
  startedAt: number;
  result: InsightsResult;
}

interface DeepJobFailedState {
  status: "failed" | "expired";
  jobId: string;
  startedAt: number;
  error: string;
}

export type DeepJobState =
  | { status: "idle" }
  | { status: "submitting" }
  | DeepJobPendingState
  | DeepJobCompletedState
  | DeepJobFailedState;

interface DeepPollResponse {
  status: "pending" | "completed" | "failed" | "expired";
  startedAt: number;
  narrative?: string;
  observations?: string[];
  generatedAt?: number;
  error?: string;
}

function readStoredJob(): StoredPendingJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_DEEP_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPendingJob;
    if (typeof parsed?.jobId === "string" && typeof parsed?.startedAt === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredJob(job: StoredPendingJob | null): void {
  if (typeof window === "undefined") return;
  if (job === null) {
    window.localStorage.removeItem(PENDING_DEEP_JOB_KEY);
  } else {
    window.localStorage.setItem(PENDING_DEEP_JOB_KEY, JSON.stringify(job));
  }
}

/**
 * Manages the lifecycle of a deep-research insight job.
 *
 * - `submit(input)` POSTs to the deep endpoint, stores the jobId, kicks off
 *   polling.
 * - On mount, if a pending jobId is found in localStorage, polling resumes.
 * - `state` reflects the current phase so the card can show idle / pending
 *   indicator / fresh result / error.
 * - `reset()` clears the most-recent completion or failure so the card can
 *   drop a stale banner once the user has seen it.
 */
export function useDeepInsightJob() {
  const [state, setState] = useState<DeepJobState>(() => {
    const stored = readStoredJob();
    if (stored) {
      return {
        status: "pending" as const,
        jobId: stored.jobId,
        startedAt: stored.startedAt,
      };
    }
    return { status: "idle" as const };
  });
  // Track the active poll timer across renders. A ref lets the polling
  // callback cancel itself when the component unmounts or the job ends.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (jobId: string, startedAt: number) => {
      try {
        const res = await apiFetch(
          `/api/analytics/insights/jobs/${encodeURIComponent(jobId)}`,
          { method: "GET" },
        );
        const body = (await res.json().catch(() => null)) as
          | DeepPollResponse
          | null;

        if (!res.ok || !body) {
          // Treat as transient unless 404 — keep polling on 5xx/network.
          if (res.status === 404) {
            writeStoredJob(null);
            setState({
              status: "failed",
              jobId,
              startedAt,
              error:
                "Deep analysis job was not found on the server. It may have been cleared.",
            });
            return;
          }
          timerRef.current = setTimeout(
            () => poll(jobId, startedAt),
            DEEP_POLL_INTERVAL_MS,
          );
          return;
        }

        if (body.status === "pending") {
          timerRef.current = setTimeout(
            () => poll(jobId, startedAt),
            DEEP_POLL_INTERVAL_MS,
          );
          return;
        }

        if (body.status === "completed" && body.narrative && body.observations) {
          writeStoredJob(null);
          // Pull from the server right now so the Dexie cache picks up the
          // server-inserted report and the history list updates without
          // waiting for the next regular sync cycle.
          schedulePull();
          setState({
            status: "completed",
            jobId,
            startedAt,
            result: {
              narrative: body.narrative,
              observations: body.observations,
              generatedAt: body.generatedAt ?? Date.now(),
            },
          });
          return;
        }

        if (body.status === "failed" || body.status === "expired") {
          writeStoredJob(null);
          setState({
            status: body.status,
            jobId,
            startedAt,
            error: body.error ?? "Deep analysis did not complete.",
          });
          return;
        }

        // Unrecognised shape — keep polling rather than wedging the UI.
        timerRef.current = setTimeout(
          () => poll(jobId, startedAt),
          DEEP_POLL_INTERVAL_MS,
        );
      } catch {
        // Network blip — try again on the next interval.
        timerRef.current = setTimeout(
          () => poll(jobId, startedAt),
          DEEP_POLL_INTERVAL_MS,
        );
      }
    },
    [],
  );

  // Resume polling on mount when a pending job was left in localStorage,
  // and tear down the timer on unmount.
  useEffect(() => {
    if (state.status === "pending") {
      poll(state.jobId, state.startedAt);
    }
    return clearTimer;
    // Only re-bind when the job id changes — `state` itself rebinds on
    // every status transition which would otherwise double-poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status === "pending" ? state.jobId : null]);

  const submit = useCallback(
    async (input: DeepJobInput): Promise<void> => {
      setState({ status: "submitting" });
      try {
        const snapshot = await buildAnalyticsSnapshot(
          input.range,
          input.goals,
          input.conditions,
          input.includeMedications,
          input.enabledTrackers,
        );
        if (snapshotIsEmpty(snapshot)) {
          throw new NotEnoughDataError();
        }
        if (input.includePrevious) {
          const previous = await getLatestInsightReport();
          if (previous) {
            const priorAssessment: PriorAssessment = {
              generatedAt: previous.generatedAt,
              rangeStart: previous.rangeStart,
              rangeEnd: previous.rangeEnd,
              summary: previous.narrative,
              observations: previous.observations,
            };
            snapshot.priorAssessments = [priorAssessment];
          }
        }

        const res = await apiFetch("/api/analytics/insights/deep", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(snapshot),
        });
        const body = (await res.json().catch(() => null)) as {
          jobId?: string;
          startedAt?: number;
          status?: string;
          error?: string;
        } | null;

        if (!res.ok || !body?.jobId) {
          throw new Error(body?.error ?? "Failed to start deep analysis.");
        }

        const stored: StoredPendingJob = {
          jobId: body.jobId,
          startedAt: body.startedAt ?? Date.now(),
        };
        writeStoredJob(stored);
        setState({
          status: "pending",
          jobId: stored.jobId,
          startedAt: stored.startedAt,
        });
      } catch (e) {
        // Any pre-submit throw (snapshot build, Dexie read, fetch error,
        // non-OK response) must leave the UI re-clickable; the previous
        // version only reset on a couple of branches and could wedge the
        // card on a "Submitting…" button forever.
        setState({ status: "idle" });
        throw e;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    clearTimer();
    writeStoredJob(null);
    setState({ status: "idle" });
  }, [clearTimer]);

  return { state, submit, reset };
}
