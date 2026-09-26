import { describe, it, expect } from "vitest";
import {
  buildJobPayload,
  readJobKey,
  readJobRequest,
  FINALISED_JOB_PAYLOAD,
} from "@/lib/server/insight-job-payload";
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";

const REQUEST: AnalyticsInsightsRequest = {
  range: { start: 1_000, end: 2_000 },
  metrics: {
    intake: {
      avgWaterMl: 1800,
      avgSodiumMg: 2100,
      waterGoalMl: 2500,
      sodiumLimitMg: 2300,
    },
  },
};

describe("insight job payload envelope", () => {
  it("round-trips the request and the key that submitted the batch", () => {
    const payload = buildJobPayload(REQUEST, {
      keySource: "shared_from",
      keyOwnerId: "grantor-1",
    });
    expect(readJobRequest(payload)).toEqual(REQUEST);
    expect(readJobKey(payload)).toEqual({
      keySource: "shared_from",
      keyOwnerId: "grantor-1",
    });
  });

  it("reads a legacy bare-request row as a request with no pinned key", () => {
    expect(readJobRequest(REQUEST)).toEqual(REQUEST);
    expect(readJobKey(REQUEST)).toBeNull();
  });

  it("reads nothing back from a finalised row", () => {
    expect(readJobRequest(FINALISED_JOB_PAYLOAD)).toBeNull();
    expect(readJobKey(FINALISED_JOB_PAYLOAD)).toBeNull();
  });

  it("rejects a key ref with an unknown source or a malformed owner", () => {
    expect(
      readJobKey({ request: REQUEST, key: { keySource: "stolen", keyOwnerId: null } }),
    ).toBeNull();
    expect(
      readJobKey({ request: REQUEST, key: { keySource: "own_stored", keyOwnerId: 42 } }),
    ).toBeNull();
  });
});
