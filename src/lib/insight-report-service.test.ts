import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  saveInsightReport,
  getInsightReports,
  getLatestInsightReport,
  deleteInsightReport,
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
