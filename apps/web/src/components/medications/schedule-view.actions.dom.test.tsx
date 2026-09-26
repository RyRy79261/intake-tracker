// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@intake/ui/toaster";
import { ScheduleView } from "@/components/medications/schedule-view";
// The test reads the seeded IndexedDB directly to assert the writes. The
// "components must use hooks, not db" rule targets component source, not tests.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import { formatLocalTime, getDeviceTimezone } from "@/lib/timezone";
import { toLocalDateKey } from "@/lib/date-utils";

const UTC_MINUTES = 480; // 08:00 UTC

function regimen(name: string) {
  const prescription = makePrescription({ genericName: name });
  const phase = makeMedicationPhase(prescription.id);
  const schedule = makePhaseSchedule(phase.id, { dosage: 50, scheduleTimeUTC: UTC_MINUTES });
  const inventory = makeInventoryItem(prescription.id, {
    prescriptionId: prescription.id,
    strength: 50,
    currentStock: 30,
  });
  return { prescription, phase, schedule, inventory };
}

function seedOf(regs: ReturnType<typeof regimen>[]) {
  return {
    prescriptions: regs.map((r) => r.prescription),
    medicationPhases: regs.map((r) => r.phase),
    phaseSchedules: regs.map((r) => r.schedule),
    inventoryItems: regs.map((r) => r.inventory),
  };
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function timeInput(): HTMLInputElement {
  return document.querySelector('input[type="time"]') as HTMLInputElement;
}

describe("ScheduleView dose actions", () => {
  it("defaults a past-date row Take to the scheduled time, not the clock", async () => {
    const user = userEvent.setup();
    const localTime = formatLocalTime(UTC_MINUTES, getDeviceTimezone());
    const r = regimen("Metoprolol");
    await renderWithFixtures(
      <ScheduleView selectedDate={yesterday()} onDoseClick={() => {}} onAddMed={() => {}} />,
      { seed: seedOf([r]) },
    );

    await screen.findByText("Metoprolol");
    await user.click(screen.getByRole("button", { name: "Take" }));
    await screen.findByRole("button", { name: "Log Dose" });
    expect(timeInput().value).toBe(localTime);
  });

  it("defaults a past-date Mark All to the group's scheduled time", async () => {
    const user = userEvent.setup();
    const localTime = formatLocalTime(UTC_MINUTES, getDeviceTimezone());
    await renderWithFixtures(
      <ScheduleView selectedDate={yesterday()} onDoseClick={() => {}} onAddMed={() => {}} />,
      { seed: seedOf([regimen("DrugA"), regimen("DrugB")]) },
    );

    await screen.findByText("DrugA");
    await user.click(screen.getByRole("button", { name: "Mark All" }));
    await screen.findByRole("button", { name: "Log Dose" });
    expect(timeInput().value).toBe(localTime);
  });

  it("Skip All skips only the unlogged doses, with the chosen reason", async () => {
    const user = userEvent.setup();
    const localTime = formatLocalTime(UTC_MINUTES, getDeviceTimezone());
    const date = yesterday();
    const a = regimen("DrugA");
    const b = regimen("DrugB");
    const takenLog = makeDoseLog(a.prescription.id, a.phase.id, a.schedule.id, {
      scheduledDate: toLocalDateKey(date),
      scheduledTime: localTime,
      status: "taken",
      actionTimestamp: date.getTime(),
    });
    await renderWithFixtures(
      <ScheduleView selectedDate={date} onDoseClick={() => {}} onAddMed={() => {}} />,
      { seed: { ...seedOf([a, b]), doseLogs: [takenLog] } },
    );

    await screen.findByText("DrugB");
    await user.click(screen.getByRole("button", { name: "Skip All" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Side effects" }));

    await waitFor(async () => {
      const bLogs = await db.doseLogs.where("scheduleId").equals(b.schedule.id).toArray();
      expect(bLogs[0]?.status).toBe("skipped");
      expect(bLogs[0]?.skipReason).toBe("Side effects");
    });
    // The already-taken dose keeps its status and its stock.
    const aLog = await db.doseLogs.get(takenLog.id);
    expect(aLog?.status).toBe("taken");
    expect((await db.inventoryItems.get(a.inventory.id))?.currentStock).toBe(30);
  });

  it("does not offer Take/Skip/Mark All/Skip All on a future day", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    await renderWithFixtures(
      <ScheduleView selectedDate={future} onDoseClick={() => {}} onAddMed={() => {}} />,
      { seed: seedOf([regimen("DrugA"), regimen("DrugB")]) },
    );

    await screen.findByText("DrugA");
    expect(screen.queryByRole("button", { name: "Take" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark All" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip All" })).not.toBeInTheDocument();
  });

  it("Undo after a Take reverts that dose and restores its stock", async () => {
    const user = userEvent.setup();
    const r = regimen("Metoprolol");
    await renderWithFixtures(
      <>
        <ScheduleView selectedDate={yesterday()} onDoseClick={() => {}} onAddMed={() => {}} />
        <Toaster />
      </>,
      { seed: seedOf([r]) },
    );

    await screen.findByText("Metoprolol");
    await user.click(screen.getByRole("button", { name: "Take" }));
    await user.click(await screen.findByRole("button", { name: "Log Dose" }));
    await waitFor(async () => {
      expect((await db.inventoryItems.get(r.inventory.id))?.currentStock).toBe(29);
    });

    await user.click(await screen.findByRole("button", { name: /undo/i }));
    await waitFor(async () => {
      const logs = await db.doseLogs.where("scheduleId").equals(r.schedule.id).toArray();
      expect(logs[0]?.status).toBe("pending");
      expect((await db.inventoryItems.get(r.inventory.id))?.currentStock).toBe(30);
    });
  });

  it("Undo after Skip All puts the skipped doses back to pending", async () => {
    const user = userEvent.setup();
    const a = regimen("DrugA");
    const b = regimen("DrugB");
    await renderWithFixtures(
      <>
        <ScheduleView selectedDate={yesterday()} onDoseClick={() => {}} onAddMed={() => {}} />
        <Toaster />
      </>,
      { seed: seedOf([a, b]) },
    );

    await screen.findByText("DrugA");
    await user.click(screen.getByRole("button", { name: "Skip All" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Forgot" }));
    await waitFor(async () => {
      expect((await db.doseLogs.toArray()).filter((l) => l.status === "skipped")).toHaveLength(2);
    });

    await user.click(await screen.findByRole("button", { name: /undo/i }));
    await waitFor(async () => {
      const logs = await db.doseLogs.toArray();
      expect(logs.map((l) => l.status)).toEqual(["pending", "pending"]);
    });
  });

  it("the Edit All drawer no longer offers a SKIP ALL that converts taken doses", async () => {
    const user = userEvent.setup();
    const localTime = formatLocalTime(UTC_MINUTES, getDeviceTimezone());
    const date = yesterday();
    const a = regimen("DrugA");
    const takenLog = makeDoseLog(a.prescription.id, a.phase.id, a.schedule.id, {
      scheduledDate: toLocalDateKey(date),
      scheduledTime: localTime,
      status: "taken",
      actionTimestamp: date.getTime(),
    });
    await renderWithFixtures(
      <ScheduleView selectedDate={date} onDoseClick={() => {}} onAddMed={() => {}} />,
      { seed: { ...seedOf([a]), doseLogs: [takenLog] } },
    );

    await screen.findByText("DrugA");
    await user.click(await screen.findByRole("button", { name: "Edit All" }));
    expect(await screen.findByText("UN-TAKE")).toBeInTheDocument();
    expect(screen.queryByText("SKIP ALL")).not.toBeInTheDocument();
  });
});
