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

/** Thrown before any network call when the 30-day window has nothing to summarise. */
export class NotEnoughDataError extends Error {
  constructor() {
    super("Not enough tracked data in the last 30 days to generate insights.");
    this.name = "NotEnoughDataError";
  }
}

interface GenerateInsightsInput {
  range: TimeRange;
  goals: IntakeGoals;
}

/**
 * Builds the analytics snapshot locally and asks the server to turn it into an
 * AI narrative. The caller triggers this explicitly (a button), so cost is
 * bounded by user intent rather than scheduled traffic.
 */
export function useGenerateInsights() {
  return useMutation<InsightsResult, Error, GenerateInsightsInput>({
    mutationFn: async ({ range, goals }) => {
      const snapshot = await buildAnalyticsSnapshot(range, goals);
      if (snapshotIsEmpty(snapshot)) {
        throw new NotEnoughDataError();
      }

      const res = await apiFetch("/api/analytics/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<InsightsResult> & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to generate insights");
      }

      return {
        narrative: body.narrative ?? "",
        observations: body.observations ?? [],
        generatedAt: body.generatedAt ?? Date.now(),
      };
    },
  });
}
