import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import {
  buildAnalyticsSnapshot,
  snapshotIsEmpty,
  type IntakeGoals,
} from "@/lib/analytics-snapshot";
import type { TimeRange } from "@/lib/analytics-types";

export interface InsightsResult {
  narrative: string;
  observations: string[];
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
}

/**
 * Builds the analytics snapshot locally and asks the server to turn it into an
 * AI narrative. The caller triggers this explicitly (a button), so cost is
 * bounded by user intent rather than scheduled traffic.
 */
export function useGenerateInsights() {
  return useMutation<InsightsResult, Error, GenerateInsightsInput>({
    mutationFn: async ({ range, goals, conditions, includeMedications }) => {
      const snapshot = await buildAnalyticsSnapshot(
        range,
        goals,
        conditions,
        includeMedications,
      );
      if (snapshotIsEmpty(snapshot)) {
        throw new NotEnoughDataError();
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
      return {
        narrative: result.narrative,
        observations: result.observations,
        generatedAt:
          typeof result.generatedAt === "number" ? result.generatedAt : Date.now(),
      };
    },
  });
}
