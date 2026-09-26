// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

import { useDeepInsightJob, useGenerateInsights } from "@/hooks/use-insights";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makeInsightReport,
  makeIntakeRecord,
} from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const RANGE = { start: NOW - 30 * DAY, end: NOW };
const GOALS = {
  waterGoalMl: 2500,
  sodiumLimitMg: 2300,
  sugarLimitG: 50,
  potassiumLimitMg: 3500,
};

function makeWrapper() {
  const client = makeTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Stub the network: every call resolves to `body` and is recorded. */
function stubFetch(body: unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

async function seedWindowData() {
  await seedDatabase({
    intakeRecords: [
      makeIntakeRecord({ type: "water", amount: 1500, timestamp: NOW - 2 * DAY }),
      makeIntakeRecord({ type: "salt", amount: 1800, timestamp: NOW - 2 * DAY }),
    ],
  });
}

const FAST_RESPONSE = {
  narrative: "Fresh narrative.",
  observations: ["Fresh observation."],
  generatedAt: NOW,
};

describe("useGenerateInsights — previous summary and personalisation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("compares against the report for an earlier period, not simply the newest one", async () => {
    await seedWindowData();
    await db.insightReports.bulkAdd([
      makeInsightReport({
        id: "earlier",
        generatedAt: NOW - 31 * DAY,
        rangeStart: NOW - 61 * DAY,
        rangeEnd: NOW - 31 * DAY,
        narrative: "Earlier period.",
      }),
      makeInsightReport({
        id: "overlapping",
        generatedAt: NOW - DAY,
        rangeStart: NOW - 31 * DAY,
        rangeEnd: NOW - DAY,
        narrative: "Overlapping period.",
      }),
    ]);
    const calls = stubFetch(FAST_RESPONSE);

    const { result } = renderHook(() => useGenerateInsights(), {
      wrapper: makeWrapper(),
    });
    await act(() =>
      result.current.mutateAsync({ range: RANGE, goals: GOALS, includePrevious: true }),
    );

    const sent = calls[0]!.body as { priorAssessments?: Array<{ summary: string }> };
    expect(sent.priorAssessments?.map((p) => p.summary)).toEqual(["Earlier period."]);
  });

  it("withholds a personalised previous summary once sharing is off", async () => {
    await seedWindowData();
    await db.insightReports.add(
      makeInsightReport({
        generatedAt: NOW - 31 * DAY,
        rangeStart: NOW - 61 * DAY,
        rangeEnd: NOW - 31 * DAY,
        narrative: "Given your HFrEF and bisoprolol...",
        personalised: true,
      }),
    );
    const calls = stubFetch(FAST_RESPONSE);

    const { result } = renderHook(() => useGenerateInsights(), {
      wrapper: makeWrapper(),
    });
    await act(() =>
      result.current.mutateAsync({ range: RANGE, goals: GOALS, includePrevious: true }),
    );

    const sent = calls[0]!.body as { priorAssessments?: unknown; profile?: unknown };
    expect(sent.profile).toBeUndefined();
    expect(sent.priorAssessments).toBeUndefined();
  });

  it("marks the report personalised only when medical context was actually sent", async () => {
    await seedWindowData();
    stubFetch(FAST_RESPONSE);

    const { result } = renderHook(() => useGenerateInsights(), {
      wrapper: makeWrapper(),
    });
    // Medication sharing on, but no active prescriptions to include.
    await act(() =>
      result.current.mutateAsync({
        range: RANGE,
        goals: GOALS,
        includeMedications: true,
      }),
    );

    const [saved] = await db.insightReports.toArray();
    expect(saved!.personalised).toBe(false);
  });
});

describe("useDeepInsightJob — completion", () => {
  beforeEach(() => {
    window.localStorage.setItem(
      "insight-deep-job-pending",
      JSON.stringify({ jobId: "job-1", startedAt: NOW - 60_000 }),
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("caches the finished report locally under the server's id", async () => {
    stubFetch({
      status: "completed",
      reportId: "server-report-1",
      narrative: "Deep narrative.",
      observations: ["Deep observation."],
      sources: ["https://example.test/ref"],
      generatedAt: NOW,
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      personalised: false,
      startedAt: NOW - 60_000,
    });

    const { result } = renderHook(() => useDeepInsightJob(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.state.status).toBe("completed"));
    const row = await db.insightReports.get("server-report-1");
    expect(row).toMatchObject({
      narrative: "Deep narrative.",
      mode: "deep",
      rangeStart: RANGE.start,
      sources: ["https://example.test/ref"],
    });
  });
});
