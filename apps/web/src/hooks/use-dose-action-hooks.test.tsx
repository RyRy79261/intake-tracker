// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type * as DoseLogServiceModule from "@/lib/dose-log-service";

// Lets a test make one slot of a bulk action fail, the way a Dexie fault
// would, while every other call goes to the real service.
const failFor = vi.hoisted(() => ({ scheduleId: null as string | null }));
vi.mock("@/lib/dose-log-service", async (importOriginal) => {
  const actual = await importOriginal<typeof DoseLogServiceModule>();
  return {
    ...actual,
    takeDose: vi.fn(async (input: Parameters<typeof actual.takeDose>[0]) =>
      input.scheduleId === failFor.scheduleId
        ? { success: false as const, error: "Failed to take dose" }
        : actual.takeDose(input),
    ),
  };
});

import {
  useTakeAllDoses,
  useSkipAllDoses,
  useRevertDoseActions,
  useTakeDose,
  useSkipDose,
  usePrnDoseLogs,
  useDailyDoseSchedule,
} from "@/hooks/use-medication-queries";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";
import { logPrnDose } from "@/lib/dose-log-service";

function wrapper({ children }: { children: ReactNode }) {
  const client = makeTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const DATE = "2026-09-24";
const TIME = "08:00";

async function seedRegimens(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const rx = makePrescription({ genericName: `Drug${i}` });
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id, { dosage: 50 });
    const inv = makeInventoryItem(rx.id, { strength: 50, currentStock: 10 });
    out.push({ rx, phase, schedule, inv });
  }
  await seedDatabase({
    prescriptions: out.map((o) => o.rx),
    medicationPhases: out.map((o) => o.phase),
    phaseSchedules: out.map((o) => o.schedule),
    inventoryItems: out.map((o) => o.inv),
  });
  return out.map((o) => ({
    prescriptionId: o.rx.id,
    phaseId: o.phase.id,
    scheduleId: o.schedule.id,
    dosageMg: 50,
    inventoryItemId: o.inv.id,
  }));
}

describe("useTakeAllDoses", () => {
  it("reports which slots succeeded and which failed instead of throwing", async () => {
    const entries = await seedRegimens(3);
    failFor.scheduleId = entries[1]!.scheduleId;
    const { result } = renderHook(() => useTakeAllDoses(), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({ entries, date: DATE, time: TIME });
    });
    failFor.scheduleId = null;

    expect(outcome!.succeeded.map((s) => s.entry.scheduleId)).toEqual([
      entries[0]!.scheduleId,
      entries[2]!.scheduleId,
    ]);
    expect(outcome!.failed.map((f) => f.entry.scheduleId)).toEqual([entries[1]!.scheduleId]);
    // Each success carries the log it wrote, so undo can be bound to it.
    expect(outcome!.succeeded[0]!.log.status).toBe("taken");
  });
});

describe("useSkipAllDoses", () => {
  it("records the chosen reason on every slot, replacing a stale one", async () => {
    const entries = await seedRegimens(1);
    const e = entries[0]!;
    await db.doseLogs.add(
      makeDoseLog(e.prescriptionId, e.phaseId, e.scheduleId, {
        scheduledDate: DATE,
        scheduledTime: TIME,
        status: "pending",
        skipReason: "Old reason",
      }),
    );
    const { result } = renderHook(() => useSkipAllDoses(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ entries, date: DATE, time: TIME, reason: "Side effects" });
    });

    const logs = await db.doseLogs.where("scheduleId").equals(e.scheduleId).toArray();
    expect(logs[0]?.status).toBe("skipped");
    expect(logs[0]?.skipReason).toBe("Side effects");
  });
});

describe("useRevertDoseActions", () => {
  it("reverts a take that is unchanged and restores stock", async () => {
    const [e] = await seedRegimens(1);
    const { result } = renderHook(
      () => ({ take: useTakeDose(), revert: useRevertDoseActions() }),
      { wrapper },
    );
    const input = { ...e!, date: DATE, time: TIME };
    let log: Awaited<ReturnType<typeof result.current.take.mutateAsync>> | undefined;
    await act(async () => {
      log = await result.current.take.mutateAsync(input);
    });
    expect((await db.inventoryItems.get(e!.inventoryItemId))?.currentStock).toBe(9);

    let res: Awaited<ReturnType<typeof result.current.revert.mutateAsync>> | undefined;
    await act(async () => {
      res = await result.current.revert.mutateAsync([{ input, log: log! }]);
    });

    expect(res).toEqual({ reverted: 1, stale: 0, failed: 0 });
    expect((await db.inventoryItems.get(e!.inventoryItemId))?.currentStock).toBe(10);
  });

  it("still reverts after the sync push ack re-stamps the log's updatedAt", async () => {
    // The push is debounced ~3s and its ack rewrites the local updatedAt to
    // the server's clock, well inside the 5s undo window. That is not a user
    // change, so it must not make the Undo stale.
    const [e] = await seedRegimens(1);
    const { result } = renderHook(
      () => ({ take: useTakeDose(), revert: useRevertDoseActions() }),
      { wrapper },
    );
    const input = { ...e!, date: DATE, time: TIME };
    let log: Awaited<ReturnType<typeof result.current.take.mutateAsync>> | undefined;
    await act(async () => {
      log = await result.current.take.mutateAsync(input);
    });
    await db.doseLogs.update(log!.id, { updatedAt: log!.updatedAt + 1234 });

    let res: Awaited<ReturnType<typeof result.current.revert.mutateAsync>> | undefined;
    await act(async () => {
      res = await result.current.revert.mutateAsync([{ input, log: log! }]);
    });

    expect(res).toEqual({ reverted: 1, stale: 0, failed: 0 });
    expect((await db.inventoryItems.get(e!.inventoryItemId))?.currentStock).toBe(10);
  });

  it("leaves a dose alone when its taken time was edited after the action", async () => {
    const [e] = await seedRegimens(1);
    const { result } = renderHook(
      () => ({ take: useTakeDose(), revert: useRevertDoseActions() }),
      { wrapper },
    );
    const input = { ...e!, date: DATE, time: TIME };
    let log: Awaited<ReturnType<typeof result.current.take.mutateAsync>> | undefined;
    await act(async () => {
      log = await result.current.take.mutateAsync(input);
    });
    await db.doseLogs.update(log!.id, { actionTimestamp: log!.actionTimestamp! - 60_000 });

    let res: Awaited<ReturnType<typeof result.current.revert.mutateAsync>> | undefined;
    await act(async () => {
      res = await result.current.revert.mutateAsync([{ input, log: log! }]);
    });

    expect(res).toEqual({ reverted: 0, stale: 1, failed: 0 });
    expect((await db.doseLogs.get(log!.id))?.status).toBe("taken");
  });

  it("leaves a dose alone when it changed after the action (e.g. skipped)", async () => {
    const [e] = await seedRegimens(1);
    const { result } = renderHook(
      () => ({ take: useTakeDose(), skip: useSkipDose(), revert: useRevertDoseActions() }),
      { wrapper },
    );
    const input = { ...e!, date: DATE, time: TIME };
    let log: Awaited<ReturnType<typeof result.current.take.mutateAsync>> | undefined;
    await act(async () => {
      log = await result.current.take.mutateAsync(input);
    });
    await act(async () => {
      await result.current.skip.mutateAsync({ ...input, reason: "Side effects" });
    });

    let res: Awaited<ReturnType<typeof result.current.revert.mutateAsync>> | undefined;
    await act(async () => {
      res = await result.current.revert.mutateAsync([{ input, log: log! }]);
    });

    expect(res).toEqual({ reverted: 0, stale: 1, failed: 0 });
    const logs = await db.doseLogs.where("scheduleId").equals(e!.scheduleId).toArray();
    expect(logs[0]?.status).toBe("skipped");
    expect(logs[0]?.skipReason).toBe("Side effects");
  });
});

describe("usePrnDoseLogs", () => {
  it("lists a prescription's recent PRN doses", async () => {
    const rx = makePrescription();
    await seedDatabase({ prescriptions: [rx] });
    await logPrnDose({ prescriptionId: rx.id, date: DATE, time: "07:15" });

    const { result } = renderHook(() => usePrnDoseLogs(rx.id, "2026-09-20"), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.scheduledTime).toBe("07:15");
  });
});

describe("useDailyDoseSchedule", () => {
  it("re-derives when the day rolls over", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
      vi.setSystemTime(new Date(2026, 8, 24, 23, 59, 30));
      const [e] = await seedRegimens(1);
      const { result } = renderHook(() => useDailyDoseSchedule(DATE), { wrapper });
      await vi.waitFor(() => expect(result.current?.[0]?.scheduleId).toBe(e!.scheduleId));
      // Before midnight, a slot later "today" is pending, not missed.
      const before = result.current?.[0]?.status;

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      // After rollover, yesterday's unlogged dose reads as missed.
      await vi.waitFor(() => expect(result.current?.[0]?.status).toBe("missed"));
      expect(before).toBe("pending");
    } finally {
      vi.useRealTimers();
    }
  });
});
