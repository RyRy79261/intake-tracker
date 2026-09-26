/**
 * Tests the terminal transitions in insight-job-service. A pending job's
 * request_payload carries the user's conditions and medications; nothing
 * reads it once the job stops being pending, so every terminal transition
 * must drop it rather than keep it in Postgres indefinitely.
 *
 * Mocks `@intake/db/client` and records what each UPDATE sets.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  returning: [{ id: "job-1" }] as Array<{ id: string }>,
}));

vi.mock("@intake/db/client", () => ({
  db: {
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        state.inserts.push(v);
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return {
          where: () => ({ returning: async () => state.returning }),
        };
      },
    }),
  },
}));

import {
  completeInsightJob,
  expireInsightJob,
  failInsightJob,
} from "@/lib/server/insight-job-service";
import { FINALISED_JOB_PAYLOAD } from "@/lib/server/insight-job-payload";

describe("insight job terminal transitions", () => {
  beforeEach(() => {
    state.updates.length = 0;
    state.inserts.length = 0;
    state.returning = [{ id: "job-1" }];
  });

  it("drops the request payload when a job fails", async () => {
    await failInsightJob("job-1", "boom");
    expect(state.updates[0]).toMatchObject({
      status: "failed",
      requestPayload: FINALISED_JOB_PAYLOAD,
    });
  });

  it("drops the request payload when a job expires", async () => {
    await expireInsightJob("job-1");
    expect(state.updates[0]).toMatchObject({
      status: "expired",
      requestPayload: FINALISED_JOB_PAYLOAD,
    });
  });

  it("drops the request payload when a job completes", async () => {
    const result = await completeInsightJob("job-1", {
      userId: "user-1",
      generatedAt: 1,
      rangeStart: 0,
      rangeEnd: 1,
      narrative: "n",
      observations: [],
      sources: null,
      personalised: false,
    });
    expect(result).not.toBeNull();
    expect(state.updates[0]).toMatchObject({
      status: "completed",
      requestPayload: FINALISED_JOB_PAYLOAD,
    });
  });
});
