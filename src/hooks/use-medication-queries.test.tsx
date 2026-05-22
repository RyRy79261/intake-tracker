// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

// The schedule mutation hooks resync notifications via a dynamic import of
// `@/lib/local-notifications`, which touches the browser Notification API.
// Stub only that module; the DB interaction stays real.
vi.mock("@/lib/local-notifications", () => ({
  syncMedicationNotifications: vi.fn().mockResolvedValue(undefined),
}));

import {
  usePrescriptions,
  usePhasesForPrescription,
  useInventoryForPrescription,
  useAllActiveInventoryItems,
  useSchedulesForPhase,
  useTitrationPlans,
  useConditionLabels,
  useUpdatePrescription,
  useDeletePrescription,
  useAddSchedule,
  useDeleteSchedule,
  useAdjustStock,
} from "@/hooks/use-medication-queries";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase, medicationRegimen } from "@/__tests__/fixtures/scenarios";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeTitrationPlan,
} from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";

function wrapper({ children }: { children: ReactNode }) {
  const client = makeTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("read hooks", () => {
  it("usePrescriptions returns prescriptions seeded into the DB", async () => {
    const rx = makePrescription({ genericName: "Lisinopril" });
    await seedDatabase({ prescriptions: [rx] });

    const { result } = renderHook(() => usePrescriptions(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.genericName).toBe("Lisinopril");
  });

  it("usePrescriptions excludes soft-deleted prescriptions", async () => {
    await seedDatabase({
      prescriptions: [
        makePrescription({ genericName: "Active" }),
        makePrescription({ genericName: "Deleted", deletedAt: Date.now() }),
      ],
    });

    const { result } = renderHook(() => usePrescriptions(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.genericName).toBe("Active");
  });

  it("usePhasesForPrescription returns only that prescription's phases", async () => {
    const rxA = makePrescription();
    const rxB = makePrescription();
    await seedDatabase({
      prescriptions: [rxA, rxB],
      medicationPhases: [
        makeMedicationPhase(rxA.id),
        makeMedicationPhase(rxA.id),
        makeMedicationPhase(rxB.id),
      ],
    });

    const { result } = renderHook(
      () => usePhasesForPrescription(rxA.id),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.every((p) => p.prescriptionId === rxA.id)).toBe(true);
  });

  it("usePhasesForPrescription returns an empty list for an undefined id", async () => {
    const { result } = renderHook(
      () => usePhasesForPrescription(undefined),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("useInventoryForPrescription returns that prescription's inventory items", async () => {
    const rx = makePrescription();
    await seedDatabase({
      prescriptions: [rx],
      inventoryItems: [makeInventoryItem(rx.id, { brandName: "Zestril" })],
    });

    const { result } = renderHook(
      () => useInventoryForPrescription(rx.id),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.brandName).toBe("Zestril");
  });

  it("useAllActiveInventoryItems excludes inactive items", async () => {
    const rx = makePrescription();
    await seedDatabase({
      prescriptions: [rx],
      inventoryItems: [
        makeInventoryItem(rx.id, { brandName: "Active", isActive: true }),
        makeInventoryItem(rx.id, { brandName: "Inactive", isActive: false }),
      ],
    });

    const { result } = renderHook(() => useAllActiveInventoryItems(), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.brandName).toBe("Active");
  });

  it("useSchedulesForPhase returns the phase's schedules", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    await seedDatabase({
      prescriptions: [rx],
      medicationPhases: [phase],
      phaseSchedules: [makePhaseSchedule(phase.id, { time: "09:00" })],
    });

    const { result } = renderHook(
      () => useSchedulesForPhase(phase.id),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.time).toBe("09:00");
  });

  it("useTitrationPlans returns non-deleted titration plans", async () => {
    await seedDatabase({
      titrationPlans: [
        makeTitrationPlan({ title: "Ramp Up" }),
        makeTitrationPlan({ title: "Old", deletedAt: Date.now() }),
      ],
    });

    const { result } = renderHook(() => useTitrationPlans(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.title).toBe("Ramp Up");
  });

  it("useConditionLabels aggregates labels from plans and prescriptions", async () => {
    await seedDatabase({
      prescriptions: [makePrescription({ indication: "Hypertension" })],
      titrationPlans: [makeTitrationPlan({ conditionLabel: "Anxiety" })],
    });

    const { result } = renderHook(() => useConditionLabels(), { wrapper });

    await waitFor(() => expect(result.current).toEqual(["Anxiety", "Hypertension"]));
  });
});

describe("mutation hooks", () => {
  it("useUpdatePrescription writes the change through to the DB", async () => {
    const rx = makePrescription({ genericName: "Metoprolol" });
    await seedDatabase({ prescriptions: [rx] });

    const { result } = renderHook(() => useUpdatePrescription(), { wrapper });

    await result.current.mutateAsync({
      id: rx.id,
      updates: { genericName: "Atenolol" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const updated = await db.prescriptions.get(rx.id);
    expect(updated!.genericName).toBe("Atenolol");
  });

  it("useDeletePrescription soft-deletes the prescription", async () => {
    const rx = makePrescription();
    await seedDatabase({ prescriptions: [rx] });

    const { result } = renderHook(() => useDeletePrescription(), { wrapper });

    await result.current.mutateAsync(rx.id);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const deleted = await db.prescriptions.get(rx.id);
    expect(deleted!.deletedAt).not.toBeNull();
  });

  it("useAddSchedule inserts a new enabled schedule for the phase", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    await seedDatabase({ prescriptions: [rx], medicationPhases: [phase] });

    const { result } = renderHook(() => useAddSchedule(), { wrapper });

    await result.current.mutateAsync({
      phaseId: phase.id,
      time: "20:00",
      scheduleTimeUTC: 1200,
      anchorTimezone: "UTC",
      dosage: 25,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      updatedAt: Date.now(),
      deletedAt: null,
      deviceId: "test-device",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const schedules = await db.phaseSchedules
      .where("phaseId")
      .equals(phase.id)
      .toArray();
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.time).toBe("20:00");
    expect(schedules[0]!.enabled).toBe(true);
  });

  it("useDeleteSchedule soft-deletes the schedule", async () => {
    const { prescriptions, medicationPhases, phaseSchedules, inventoryItems } =
      medicationRegimen();
    await seedDatabase({
      prescriptions,
      medicationPhases,
      phaseSchedules,
      inventoryItems,
    });
    const scheduleId = phaseSchedules[0]!.id;

    const { result } = renderHook(() => useDeleteSchedule(), { wrapper });

    await result.current.mutateAsync(scheduleId);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const sched = await db.phaseSchedules.get(scheduleId);
    expect(sched!.deletedAt).not.toBeNull();
  });

  it("useAdjustStock applies a stock delta and logs a transaction", async () => {
    const rx = makePrescription();
    const inventory = makeInventoryItem(rx.id, { currentStock: 30 });
    await seedDatabase({ prescriptions: [rx], inventoryItems: [inventory] });

    const { result } = renderHook(() => useAdjustStock(), { wrapper });

    const newStock = await result.current.mutateAsync({
      inventoryItemId: inventory.id,
      amount: 12,
      type: "refill",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(newStock).toBe(42);
    const item = await db.inventoryItems.get(inventory.id);
    expect(item!.currentStock).toBe(42);

    const txs = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inventory.id)
      .toArray();
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBe(12);
  });
});
