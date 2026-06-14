// @vitest-environment jsdom
/**
 * Client-side scale stress test for the History "Records" tab.
 *
 * The existing dom test asserts behaviour with 1–2 seeded records. This
 * file flips the question: how does the component perform when the user
 * has accumulated months of data?
 *
 * Paradigm (docs/TESTING_STRATEGY.md §2.11): cheap client-side load
 * testing via fake-indexeddb. Independent of any server load test, this
 * catches:
 *   - useEffect chains that accidentally become O(n²) over the record list
 *   - Recharts/Radix mounts that don't paginate / virtualise
 *   - React Query cache blow-ups
 *   - The render-budget moment when the UI stops being usable
 *
 * Why "stress" and not just a benchmark: this asserts a *budget* (the
 * render completes inside a wall-clock limit). A regression that doubles
 * render time fails the test; a vitest bench would only log the slowdown.
 *
 * Scale chosen: 5 000 mixed records ≈ 1 record every 5 minutes for 12
 * days, which is a plausible heavy-user month. Budget: 5 seconds for the
 * first paint that includes "No records" or any record row text. Budget
 * is intentionally generous — this test catches catastrophic regressions
 * (O(n²)), not micro-optimisations.
 */
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { RecordsTab } from "@/components/analytics/records-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord, makeWeightRecord } from "@/__tests__/fixtures/db-fixtures";
import type { TimeRange } from "@intake/types/analytics";

const DAY_MS = 86_400_000;

describe("RecordsTab — scale stress", () => {
  it("renders inside 5 s with 5 000 mixed records spread across 90 days", async () => {
    const now = Date.now();
    const range: TimeRange = { start: now - 90 * DAY_MS, end: now + DAY_MS };

    // Build 5 000 records distributed across the 90-day range. Mix of
    // intake (water + salt + sugar) and weight to exercise the
    // multi-domain grouping logic.
    const intakeRecords: ReturnType<typeof makeIntakeRecord>[] = [];
    const weightRecords: ReturnType<typeof makeWeightRecord>[] = [];

    for (let i = 0; i < 5_000; i++) {
      const ts = now - Math.floor((i / 5_000) * 90 * DAY_MS);
      // 80% intake, 20% weight
      if (i % 5 === 0) {
        weightRecords.push(makeWeightRecord({ weight: 70 + (i % 10), timestamp: ts }));
      } else {
        const type = i % 3 === 0 ? "salt" : i % 3 === 1 ? "water" : "sugar";
        const amount = type === "water" ? 250 : type === "salt" ? 400 : 8;
        intakeRecords.push(makeIntakeRecord({ type, amount, timestamp: ts }));
      }
    }

    const start = performance.now();

    await renderWithFixtures(<RecordsTab range={range} />, {
      seed: { intakeRecords, weightRecords },
    });

    // Render is considered "complete" when at least one record row
    // appears in the DOM. The component is async (live query → effect →
    // render), so use waitFor with a generous internal timeout.
    await waitFor(
      () => {
        const rows = screen.queryAllByText(/ml|mg|g|kg/);
        expect(rows.length).toBeGreaterThan(0);
      },
      { timeout: 8_000 },
    );

    const elapsed = performance.now() - start;

    // Budget is the *whole* test setup (seed + mount + first paint).
    // Seeding 5 000 fake-indexeddb rows is itself ≈1–2 s, so a 5 s ceiling
    // gives the component ≈3 s for the live query + render + first row.
    // If this fails on CI, investigate before raising the ceiling.
    expect(
      elapsed,
      `first paint took ${elapsed.toFixed(0)} ms (budget 5 000 ms)`,
    ).toBeLessThan(5_000);
  }, 30_000);

  it("renders inside 2 s with 500 records (a typical 1-month user)", async () => {
    const now = Date.now();
    const range: TimeRange = { start: now - 30 * DAY_MS, end: now + DAY_MS };

    const intakeRecords = Array.from({ length: 500 }, (_, i) =>
      makeIntakeRecord({
        type: i % 2 === 0 ? "water" : "salt",
        amount: i % 2 === 0 ? 250 : 400,
        timestamp: now - Math.floor((i / 500) * 30 * DAY_MS),
      }),
    );

    const start = performance.now();
    await renderWithFixtures(<RecordsTab range={range} />, {
      seed: { intakeRecords },
    });
    await waitFor(
      () => {
        expect(screen.queryAllByText(/ml|mg/).length).toBeGreaterThan(0);
      },
      { timeout: 5_000 },
    );
    const elapsed = performance.now() - start;

    expect(
      elapsed,
      `first paint took ${elapsed.toFixed(0)} ms (budget 2 000 ms)`,
    ).toBeLessThan(2_000);
  }, 15_000);

  it("handles 50 000 records without throwing — memory/quota smoke", async () => {
    // This is a "doesn't catastrophically crash" test rather than a perf
    // budget. fake-indexeddb is in-memory so this also indirectly
    // sanity-checks that nothing tries to load the full set into a
    // single array (e.g. via `.toArray()` on the whole table without a
    // range filter).
    //
    // We use a very narrow range to keep the visible window small so the
    // dom render doesn't need to materialise all 50k.
    const now = Date.now();
    const range: TimeRange = { start: now - DAY_MS, end: now + DAY_MS };

    const records = Array.from({ length: 50_000 }, (_, i) =>
      makeIntakeRecord({
        type: "water",
        amount: 250,
        // 99% are outside the visible window, only ~500 inside
        timestamp: now - Math.floor((i / 50_000) * 200 * DAY_MS),
      }),
    );

    // Filter (don't suppress) console.error: ignore only the known
    // React `act(...)` warning that Recharts emits from background
    // animation timers, and re-throw anything else so a real error
    // can't hide behind this blanket spy.
    const original = console.error;
    const unexpected: unknown[][] = [];
    const errSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        const msg = String(args[0] ?? "");
        if (/not wrapped in act\(/i.test(msg)) return; // benign Recharts timer noise
        unexpected.push(args);
        original.apply(console, args as Parameters<typeof console.error>);
      });
    try {
      await renderWithFixtures(<RecordsTab range={range} />, {
        seed: { intakeRecords: records },
      });
      // The component must mount; we don't assert on contents.
      await waitFor(
        () => {
          // Either records render or the empty state — both prove the
          // live query resolved without throwing.
          const anyText =
            screen.queryAllByText(/ml|mg|No records/).length > 0;
          expect(anyText).toBe(true);
        },
        { timeout: 15_000 },
      );
    } finally {
      errSpy.mockRestore();
    }
    // Surface anything the filter passed through. If a real error
    // slipped in alongside the benign act warnings, fail the test.
    expect(
      unexpected,
      `unexpected console.error calls during scale render: ${unexpected.map((a) => String(a[0])).join("; ")}`,
    ).toEqual([]);
  }, 45_000);
});
