import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  saveInsightReport,
  getInsightReports,
  getLatestInsightReport,
  deleteInsightReport,
  getPreviousInsightReport,
  priorAssessmentFor,
  isPersonalisedRequest,
  cacheServerInsightReport,
  type NewInsightReport,
} from "@/lib/insight-report-service";

function makeInput(overrides?: Partial<NewInsightReport>): NewInsightReport {
  return {
    generatedAt: 1_700_000_000_000,
    rangeStart: 1_699_000_000_000,
    rangeEnd: 1_700_000_000_000,
    narrative: "Water intake averaged 1800 ml.",
    observations: ["Sodium under limit."],
    personalised: false,
    ...overrides,
  };
}

describe("saveInsightReport", () => {
  it("persists a report and defaults mode to 'fast'", async () => {
    const result = await saveInsightReport(makeInput());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const stored = await db.insightReports.get(result.data.id);
    expect(stored).toBeDefined();
    expect(stored!.mode).toBe("fast");
    expect(stored!.deletedAt).toBeNull();
  });

  it("retains an explicit 'deep' mode and sources", async () => {
    const result = await saveInsightReport(
      makeInput({ mode: "deep", sources: ["https://example.com"] }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    const stored = await db.insightReports.get(result.data.id);
    expect(stored!.mode).toBe("deep");
    expect(stored!.sources).toEqual(["https://example.com"]);
  });

  it("omits the sources field when none are supplied", async () => {
    const result = await saveInsightReport(makeInput());
    expect(result.success).toBe(true);
    if (!result.success) return;
    const stored = await db.insightReports.get(result.data.id);
    expect(stored!.sources).toBeUndefined();
  });
});

describe("getInsightReports / getLatestInsightReport — latest-wins ordering", () => {
  it("returns reports sorted by generatedAt descending (newest first)", async () => {
    const older = await saveInsightReport(makeInput({ generatedAt: 1_000 }));
    const newer = await saveInsightReport(makeInput({ generatedAt: 9_000 }));
    const middle = await saveInsightReport(makeInput({ generatedAt: 5_000 }));
    expect(older.success && newer.success && middle.success).toBe(true);
    if (!older.success || !newer.success || !middle.success) return;

    const all = await getInsightReports();
    expect(all.map((r) => r.generatedAt)).toEqual([9_000, 5_000, 1_000]);

    const latest = await getLatestInsightReport();
    expect(latest!.id).toBe(newer.data.id);
  });

  it("orders by generatedAt, not insertion/creation order", async () => {
    // Insert the highest generatedAt FIRST, lowest LAST.
    const first = await saveInsightReport(makeInput({ generatedAt: 8_000 }));
    await saveInsightReport(makeInput({ generatedAt: 2_000 }));
    expect(first.success).toBe(true);
    if (!first.success) return;

    const latest = await getLatestInsightReport();
    expect(latest!.id).toBe(first.data.id);
  });

  it("returns null from getLatestInsightReport when there are no reports", async () => {
    expect(await getLatestInsightReport()).toBeNull();
  });
});

describe("deleteInsightReport — soft delete + exclusion", () => {
  it("soft-deletes the row (sets deletedAt) and excludes it from queries", async () => {
    const saved = await saveInsightReport(makeInput({ generatedAt: 4_000 }));
    expect(saved.success).toBe(true);
    if (!saved.success) return;

    const result = await deleteInsightReport(saved.data.id);
    expect(result.success).toBe(true);

    // Row still present, but flagged deleted.
    const row = await db.insightReports.get(saved.data.id);
    expect(row).toBeDefined();
    expect(row!.deletedAt).not.toBeNull();

    // Excluded from active queries.
    expect(await getInsightReports()).toHaveLength(0);
    expect(await getLatestInsightReport()).toBeNull();
  });

  it("only removes the targeted report, leaving others as latest-wins", async () => {
    const keep = await saveInsightReport(makeInput({ generatedAt: 7_000 }));
    const remove = await saveInsightReport(makeInput({ generatedAt: 3_000 }));
    expect(keep.success && remove.success).toBe(true);
    if (!keep.success || !remove.success) return;

    await deleteInsightReport(remove.data.id);

    const all = await getInsightReports();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(keep.data.id);
    expect((await getLatestInsightReport())!.id).toBe(keep.data.id);
  });

  it("is a no-op (returns ok) for an unknown or already-deleted id", async () => {
    const missing = await deleteInsightReport("does-not-exist");
    expect(missing.success).toBe(true);

    const saved = await saveInsightReport(makeInput());
    expect(saved.success).toBe(true);
    if (!saved.success) return;
    await deleteInsightReport(saved.data.id);
    const second = await deleteInsightReport(saved.data.id);
    expect(second.success).toBe(true);
  });
});

describe("getPreviousInsightReport — a genuinely earlier period", () => {
  it("picks the latest report whose window ended at or before the new window starts", async () => {
    await saveInsightReport(
      makeInput({ generatedAt: 1_000, rangeStart: 0, rangeEnd: 1_000 }),
    );
    const earlier = await saveInsightReport(
      makeInput({ generatedAt: 5_000, rangeStart: 2_000, rangeEnd: 5_000 }),
    );
    // Newest, but covers a later period than the one being analysed.
    await saveInsightReport(
      makeInput({ generatedAt: 9_000, rangeStart: 6_000, rangeEnd: 9_000 }),
    );
    if (!earlier.success) throw new Error("save failed");

    const previous = await getPreviousInsightReport(5_000);
    expect(previous!.id).toBe(earlier.data.id);
  });

  it("returns null when every report overlaps or follows the new window", async () => {
    await saveInsightReport(
      makeInput({ generatedAt: 9_000, rangeStart: 6_000, rangeEnd: 9_000 }),
    );
    expect(await getPreviousInsightReport(7_000)).toBeNull();
  });
});

describe("priorAssessmentFor — consent carries over", () => {
  it("builds the prior assessment, sources included", async () => {
    const saved = await saveInsightReport(
      makeInput({ sources: ["https://example.test/a"] }),
    );
    if (!saved.success) throw new Error("save failed");
    expect(priorAssessmentFor(saved.data, false)).toEqual({
      generatedAt: saved.data.generatedAt,
      rangeStart: saved.data.rangeStart,
      rangeEnd: saved.data.rangeEnd,
      summary: saved.data.narrative,
      observations: saved.data.observations,
      sources: ["https://example.test/a"],
    });
  });

  it("withholds a personalised report while medical sharing is off", async () => {
    const saved = await saveInsightReport(
      makeInput({ personalised: true, narrative: "Given your HFrEF..." }),
    );
    if (!saved.success) throw new Error("save failed");
    expect(priorAssessmentFor(saved.data, false)).toBeNull();
    expect(priorAssessmentFor(saved.data, true)).not.toBeNull();
  });
});

describe("isPersonalisedRequest — derived from what is actually sent", () => {
  const base = {
    range: { start: 0, end: 1 },
    metrics: {
      intake: { avgWaterMl: 1, avgSodiumMg: 1, waterGoalMl: 1, sodiumLimitMg: 1 },
    },
  };

  it("is false when medication sharing is on but no medication made it in", () => {
    expect(
      isPersonalisedRequest({
        ...base,
        profile: { conditions: [], medications: [] },
      }),
    ).toBe(false);
    expect(isPersonalisedRequest(base)).toBe(false);
  });

  it("is true when conditions or medications were sent", () => {
    expect(
      isPersonalisedRequest({ ...base, profile: { conditions: ["HFrEF"] } }),
    ).toBe(true);
    expect(
      isPersonalisedRequest({
        ...base,
        profile: {
          conditions: [],
          medications: [
            {
              name: "Bisoprolol",
              phaseType: "maintenance",
              dose: "5 mg",
              frequency: "once daily",
              daysOnPhase: 3,
            },
          ],
        },
      }),
    ).toBe(true);
  });
});

describe("cacheServerInsightReport — a completed deep job lands locally", () => {
  const serverReport = {
    id: "server-report-1",
    generatedAt: 8_000,
    rangeStart: 1_000,
    rangeEnd: 8_000,
    narrative: "Deep narrative.",
    observations: ["Deep observation."],
    sources: ["https://example.test/ref"],
    personalised: true,
  };

  it("stores the report under the server's id without queueing a push", async () => {
    const result = await cacheServerInsightReport(serverReport);
    expect(result.success).toBe(true);

    const row = await db.insightReports.get("server-report-1");
    expect(row).toMatchObject({ ...serverReport, mode: "deep", deletedAt: null });
    // The server already holds this row; a later pull dedupes on the id.
    expect(
      await db._syncQueue
        .where("[tableName+recordId]")
        .equals(["insightReports", "server-report-1"])
        .count(),
    ).toBe(0);
  });

  it("never overwrites or resurrects a row the device already has", async () => {
    await cacheServerInsightReport(serverReport);
    await deleteInsightReport("server-report-1");

    await cacheServerInsightReport({ ...serverReport, narrative: "Changed." });

    const row = await db.insightReports.get("server-report-1");
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.narrative).toBe("Deep narrative.");
  });
});
