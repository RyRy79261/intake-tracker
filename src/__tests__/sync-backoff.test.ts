/**
 * Sync backoff — nextBackoff() math & jitter bounds (Phase 43 Plan 06 Task 1).
 *
 * Covers SYNC-02 (retry backoff sequence + ±20% jitter cap 60s).
 *
 * Refs:
 * - 43-CONTEXT.md §D-11 — exponential backoff with cap + jitter (2s..60s, ±20%)
 * - 43-RESEARCH.md Pitfall 7 (retry storm without jitter)
 * - 43-VALIDATION.md row 6 (sync-backoff math) + row 5 (topo) + row 19 (ack)
 *
 * Strategy: call nextBackoff(n) a large number of times and assert the
 * distribution lands inside the documented ±20% envelope around the cap-aware
 * base of `min(2000 * 2^attempts, 60000)`.
 */
import { describe, it, expect } from "vitest";
import { nextBackoff } from "@/lib/sync-engine";

const JITTER_MIN = 0.8;
const JITTER_MAX = 1.2;

function baseDelay(attempts: number): number {
  return Math.min(2000 * Math.pow(2, attempts), 60000);
}

describe("sync-backoff", () => {
  it("attempt 1 returns base delay 2000ms within ±20% jitter", () => {
    for (let i = 0; i < 200; i++) {
      const v = nextBackoff(0);
      expect(v).toBeGreaterThanOrEqual(2000 * JITTER_MIN);
      expect(v).toBeLessThanOrEqual(2000 * JITTER_MAX);
    }
  });

  it("sequence is 2→4→8→16→32→60s before cap (median ±20% of base per attempt)", () => {
    const expectedBases = [2000, 4000, 8000, 16000, 32000, 60000];
    for (let attempts = 0; attempts < expectedBases.length; attempts++) {
      const samples: number[] = [];
      for (let i = 0; i < 200; i++) {
        samples.push(nextBackoff(attempts));
      }
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)]!;
      const base = expectedBases[attempts]!;
      expect(median).toBeGreaterThanOrEqual(base * JITTER_MIN);
      expect(median).toBeLessThanOrEqual(base * JITTER_MAX);
      // All samples in ±20% envelope of the cap-aware base.
      for (const v of samples) {
        expect(v).toBeGreaterThanOrEqual(base * JITTER_MIN);
        expect(v).toBeLessThanOrEqual(base * JITTER_MAX);
      }
    }
  });

  it("caps at 60000ms for attempts ≥ 6", () => {
    for (const attempts of [6, 8, 10, 20, 100]) {
      for (let i = 0; i < 200; i++) {
        const v = nextBackoff(attempts);
        expect(v).toBeGreaterThanOrEqual(60000 * JITTER_MIN);
        expect(v).toBeLessThanOrEqual(60000 * JITTER_MAX);
      }
    }
  });

  it("jitter factor is always within [0.8, 1.2]", () => {
    for (let attempts = 0; attempts < 12; attempts++) {
      const base = baseDelay(attempts);
      for (let i = 0; i < 200; i++) {
        const ratio = nextBackoff(attempts) / base;
        expect(ratio).toBeGreaterThanOrEqual(JITTER_MIN);
        expect(ratio).toBeLessThanOrEqual(JITTER_MAX);
      }
    }
  });
});
