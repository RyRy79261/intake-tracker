// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  useTakeDoses,
  useSkipDoses,
  useRevertDoseChanges,
  useSkipDose,
  usePrnDoseLogs,
  useDailyDoseSchedule,
} from "@/hooks/use-medication-queries";
import { useSettingsStore } from "@/stores/settings-store";
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

function keysOf(entries: Awaited<ReturnType<typeof seedRegimens>>) {
  return entries.map((e) => ({ ...e, date: DATE, time: TIME }));
}

describe("useTakeDoses", () => {
  it("writes every dose in one go, or none when one fails", async () => {
    const entries = keysOf(await seedRegimens(3));
    // The second dose is of a future day: the whole batch is refused.
    const bad = [entries[0]!, { ...entries[1]!, date: "2999-01-01" }, entries[2]!];
    const { result } = renderHook(() => useTakeDoses(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ entries: bad })).rejects.toThrow(/future date/);
    });
    expect(await db.doseLogs.count()).toBe(0);

    let changes: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      changes = await result.current.mutateAsync({ entries });
    });
    expect(changes!.map((c) => c.key.scheduleId)).toEqual(entries.map((e) => e.scheduleId));
    // Each change carries the log it wrote and the one before, for undo.
    expect(changes![0]!.after.status).toBe("taken");
    expect(changes![0]!.before).toBeUndefined();
  });
});

describe("useSkipDoses", () => {
  it("records the chosen reason on every open dose, replacing a stale one", async () => {
    const entries = keysOf(await seedRegimens(1));
    const e = entries[0]!;
    await db.doseLogs.add(
      makeDoseLog(e.prescriptionId, e.phaseId, e.scheduleId, {
        scheduledDate: DATE,
        scheduledTime: TIME,
        status: "pending",
        skipReason: "Old reason",
      }),
    );
    const { result } = renderHook(() => useSkipDoses(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ entries, reason: "Cost" });
    });

    const logs = await db.doseLogs.where("scheduleId").equals(e.scheduleId).toArray();
    expect(logs[0]?.status).toBe("skipped");
    expect(logs[0]?.skipReason).toBe("Cost");
  });
});

describe("useRevertDoseChanges", () => {
  async function takeOne() {
    const [e] = keysOf(await seedRegimens(1));
    const { result } = renderHook(
      () => ({ take: useTakeDoses(), skip: useSkipDose(), revert: useRevertDoseChanges() }),
      { wrapper },
    );
    let changes: Awaited<ReturnType<typeof result.current.take.mutateAsync>> = [];
    await act(async () => {
      changes = await result.current.take.mutateAsync({ entries: [e!] });
    });
    return { e: e!, result, changes };
  }

  it("reverts a take that is unchanged and restores stock", async () => {
    const { e, result, changes } = await takeOne();
    expect((await db.inventoryItems.get(e.inventoryItemId))?.currentStock).toBe(9);

    let res: Awaited<ReturnType<typeof result.current.revert.mutateAsync>> | undefined;
    await act(async () => {
      res = await result.current.revert.mutateAsync(changes);
    });

    expect(res).toEqual({ reverted: 1, stale: 0 });
    expect((await db.inventoryItems.get(e.inventoryItemId))?.currentStock).toBe(10);
  });

  it("still reverts after the sync push ack re-stamps the log's updatedAt", async () => {
    // The push ack rewrites the local updatedAt to the server's clock, well
    // inside the 5s undo window. That is not a user change.
    const { e, result, changes } = await takeOne();
    await db.doseLogs.update(changes[0]!.after.id, { updatedAt: changes[0]!.after.updatedAt + 1234 });

    let res: Awaited<ReturnType<typeof result.current.revert.mutateAsync>> | undefined;
    await act(async () => {
      res = await result.current.revert.mutateAsync(changes);
    });

    expect(res).toEqual({ reverted: 1, stale: 0 });
    expect((await db.inventoryItems.get(e.inventoryItemId))?.currentStock).toBe(10);
  });

  it("leaves a dose alone when its taken time was edited after the action", async () => {
    const { result, changes } = await takeOne();
    const log = changes[0]!.after;
    await db.doseLogs.update(log.id, { actionTimestamp: log.actionTimestamp! - 60_000 });

    let res: Awaited<ReturnType<typeof result.current.revert.mutateAsync>> | undefined;
    await act(async () => {
      res = await result.current.revert.mutateAsync(changes);
    });

    expect(res).toEqual({ reverted: 0, stale: 1 });
    expect((await db.doseLogs.get(log.id))?.status).toBe("taken");
  });

  it("leaves a dose alone when it changed after the action (e.g. skipped)", async () => {
    const { e, result, changes } = await takeOne();
    await act(async () => {
      await result.current.skip.mutateAsync({ ...e, reason: "Cost" });
    });

    let res: Awaited<ReturnType<typeof result.current.revert.mutateAsync>> | undefined;
    await act(async () => {
      res = await result.current.revert.mutateAsync(changes);
    });

    expect(res).toEqual({ reverted: 0, stale: 1 });
    const logs = await db.doseLogs.where("scheduleId").equals(e.scheduleId).toArray();
    expect(logs[0]?.status).toBe("skipped");
    expect(logs[0]?.skipReason).toBe("Cost");
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
  it("turns an open dose Missed while the screen is open, when its reminder period ends", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
      useSettingsStore.setState({ reminderPeriodMinutes: 30 });
      // 08:00 UTC on DATE, plus 29 minutes: still inside the period.
      vi.setSystemTime(Date.UTC(2026, 8, 24, 8, 29));
      const [e] = await seedRegimens(1);
      const { result } = renderHook(() => useDailyDoseSchedule(DATE), { wrapper });
      await vi.waitFor(() => expect(result.current?.[0]?.scheduleId).toBe(e!.scheduleId));
      expect(result.current?.[0]?.status).toBe("pending");

      act(() => {
        vi.advanceTimersByTime(2 * 60_000);
      });
      await vi.waitFor(() => expect(result.current?.[0]?.status).toBe("missed"));
    } finally {
      vi.useRealTimers();
    }
  });
});
