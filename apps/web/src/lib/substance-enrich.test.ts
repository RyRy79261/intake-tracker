import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — declared before the import under test.
// apiFetch is mocked; substance-service runs against the real fake-IndexedDB.
// ---------------------------------------------------------------------------

const apiFetch = vi.fn();
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  isCapacitorMode: () => false,
}));

import { runSubstanceEnrichment } from "@/lib/substance-enrich";
import { db } from "@/lib/db";
import { makeSubstanceRecord } from "@/__tests__/fixtures/db-fixtures";

/** Build a Response-like object the runner can consume. */
function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("runSubstanceEnrichment", () => {
  it("returns all-zero counts when there are no unenriched records", async () => {
    const result = await runSubstanceEnrichment();
    expect(result).toEqual({ enriched: 0, failed: 0, total: 0 });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("enriches a caffeine record and writes the AI estimate back", async () => {
    const rec = makeSubstanceRecord({
      type: "caffeine",
      source: "water_intake",
      aiEnriched: false,
      description: "flat white",
      amountMg: 0,
    });
    await db.substanceRecords.add(rec);

    apiFetch.mockResolvedValue(
      jsonResponse({ caffeineMg: 130, volumeMl: 240 }),
    );

    const result = await runSubstanceEnrichment();
    expect(result).toEqual({ enriched: 1, failed: 0, total: 1 });

    const updated = await db.substanceRecords.get(rec.id);
    expect(updated!.amountMg).toBe(130);
    expect(updated!.volumeMl).toBe(240);
    expect(updated!.aiEnriched).toBe(true);
  });

  it("enriches an alcohol record including abvPercent when present", async () => {
    const rec = makeSubstanceRecord({
      type: "alcohol",
      source: "water_intake",
      aiEnriched: false,
      description: "glass of red wine",
    });
    await db.substanceRecords.add(rec);

    apiFetch.mockResolvedValue(
      jsonResponse({ standardDrinks: 1.4, volumeMl: 150, abvPercent: 13.5 }),
    );

    const result = await runSubstanceEnrichment();
    expect(result.enriched).toBe(1);

    const updated = await db.substanceRecords.get(rec.id);
    expect(updated!.amountStandardDrinks).toBe(1.4);
    expect(updated!.volumeMl).toBe(150);
    expect(updated!.abvPercent).toBe(13.5);
    expect(updated!.aiEnriched).toBe(true);
  });

  it("counts a record as failed when the API responds non-ok", async () => {
    const rec = makeSubstanceRecord({
      type: "caffeine",
      source: "water_intake",
      aiEnriched: false,
    });
    await db.substanceRecords.add(rec);

    apiFetch.mockResolvedValue(jsonResponse({}, false));

    const result = await runSubstanceEnrichment();
    expect(result).toEqual({ enriched: 0, failed: 1, total: 1 });

    // Record left untouched — still not enriched.
    const untouched = await db.substanceRecords.get(rec.id);
    expect(untouched!.aiEnriched).toBe(false);
  });

  it("counts a record as failed when apiFetch rejects (network error)", async () => {
    const rec = makeSubstanceRecord({
      type: "caffeine",
      source: "water_intake",
      aiEnriched: false,
    });
    await db.substanceRecords.add(rec);

    apiFetch.mockRejectedValue(new Error("offline"));

    const result = await runSubstanceEnrichment();
    expect(result).toEqual({ enriched: 0, failed: 1, total: 1 });
  });

  it("counts a record as failed when the response omits the expected field", async () => {
    const rec = makeSubstanceRecord({
      type: "caffeine",
      source: "water_intake",
      aiEnriched: false,
    });
    await db.substanceRecords.add(rec);

    // caffeine record but response has no caffeineMg
    apiFetch.mockResolvedValue(jsonResponse({ volumeMl: 200 }));

    const result = await runSubstanceEnrichment();
    expect(result).toEqual({ enriched: 0, failed: 1, total: 1 });
  });

  it("ignores already-enriched and non-water_intake records", async () => {
    await db.substanceRecords.bulkAdd([
      makeSubstanceRecord({ source: "water_intake", aiEnriched: true }),
      makeSubstanceRecord({ source: "standalone", aiEnriched: false }),
    ]);

    const result = await runSubstanceEnrichment();
    expect(result.total).toBe(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("skips soft-deleted records", async () => {
    await db.substanceRecords.add(
      makeSubstanceRecord({
        source: "water_intake",
        aiEnriched: false,
        deletedAt: Date.now(),
      }),
    );

    const result = await runSubstanceEnrichment();
    expect(result.total).toBe(0);
  });

  it("processes records spanning multiple batches (mix of success and failure)", async () => {
    // 7 records → two batches (5 + 2).
    const records = Array.from({ length: 7 }, (_, i) =>
      makeSubstanceRecord({
        type: "caffeine",
        source: "water_intake",
        aiEnriched: false,
        description: `coffee ${i}`,
      }),
    );
    await db.substanceRecords.bulkAdd(records);

    // Odd-indexed calls succeed, even-indexed fail.
    let call = 0;
    apiFetch.mockImplementation(async () => {
      const ok = call++ % 2 === 1;
      return jsonResponse(ok ? { caffeineMg: 100, volumeMl: 200 } : {}, ok);
    });

    vi.useFakeTimers();
    const promise = runSubstanceEnrichment();
    // Drain the inter-batch 1s delay.
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result.total).toBe(7);
    expect(result.enriched + result.failed).toBe(7);
    expect(apiFetch).toHaveBeenCalledTimes(7);
  });
});
