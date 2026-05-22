/**
 * Tests for POST /api/push/sync-schedule — syncs the user's dose schedule
 * (and optionally timezone) to the push database.
 *
 * withAuth is a pass-through HOF; syncDoseSchedules / updateTimezone are
 * mocked. Covers happy path (with and without timezone), body validation,
 * and the error path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockSyncDoseSchedules = vi.fn();
const mockUpdateTimezone = vi.fn();
vi.mock("@/lib/push-db", () => ({
  syncDoseSchedules: (...args: unknown[]) => mockSyncDoseSchedules(...args),
  updateTimezone: (...args: unknown[]) => mockUpdateTimezone(...args),
}));

vi.mock("@/lib/auth-middleware", () => ({
  withAuth:
    (handler: (ctx: { request: NextRequest; auth: unknown }) => Promise<Response>) =>
    async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test", email: "test@example.test" },
      }),
}));

function makeRequest(rawBody: string): NextRequest {
  return new NextRequest("http://localhost/api/push/sync-schedule", {
    method: "POST",
    body: rawBody,
    headers: { "content-type": "application/json" },
  });
}

async function callSync(rawBody: string) {
  const { POST } = await import("./route");
  return POST(makeRequest(rawBody));
}

const VALID_SCHEDULE = {
  timeSlot: "09:00",
  dayOfWeek: 1,
  medicationsJson: "Aspirin 100mg",
};

describe("POST /api/push/sync-schedule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSyncDoseSchedules.mockResolvedValue(undefined);
    mockUpdateTimezone.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("syncs schedules and returns { ok: true, count }", async () => {
    const res = await callSync(
      JSON.stringify({
        schedules: [VALID_SCHEDULE, { ...VALID_SCHEDULE, timeSlot: "12:00" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 2 });
    expect(mockSyncDoseSchedules).toHaveBeenCalledWith("user-test", [
      VALID_SCHEDULE,
      { ...VALID_SCHEDULE, timeSlot: "12:00" },
    ]);
    expect(mockUpdateTimezone).not.toHaveBeenCalled();
  });

  it("updates the timezone when one is supplied", async () => {
    const res = await callSync(
      JSON.stringify({
        schedules: [VALID_SCHEDULE],
        timezone: "Africa/Johannesburg",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 1 });
    expect(mockUpdateTimezone).toHaveBeenCalledWith(
      "user-test",
      "Africa/Johannesburg",
    );
  });

  it("accepts an empty schedule array", async () => {
    const res = await callSync(JSON.stringify({ schedules: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 0 });
    expect(mockSyncDoseSchedules).toHaveBeenCalledWith("user-test", []);
  });

  it("rejects with 400 when timeSlot is not in HH:MM format", async () => {
    const res = await callSync(
      JSON.stringify({ schedules: [{ ...VALID_SCHEDULE, timeSlot: "9am" }] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSyncDoseSchedules).not.toHaveBeenCalled();
  });

  it("rejects with 400 when dayOfWeek is out of range", async () => {
    const res = await callSync(
      JSON.stringify({ schedules: [{ ...VALID_SCHEDULE, dayOfWeek: 7 }] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSyncDoseSchedules).not.toHaveBeenCalled();
  });

  it("rejects with 400 when the schedules field is missing", async () => {
    const res = await callSync(JSON.stringify({ timezone: "UTC" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
  });

  it("rejects with 400 when the body is malformed JSON", async () => {
    const res = await callSync("not json at all");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSyncDoseSchedules).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when syncDoseSchedules throws (no raw error leak)", async () => {
    mockSyncDoseSchedules.mockRejectedValue(
      new Error("sync failed against db host secret-db.local"),
    );
    const res = await callSync(JSON.stringify({ schedules: [VALID_SCHEDULE] }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to sync schedules" });
    expect(JSON.stringify(body)).not.toContain("secret-db.local");
  });
});
