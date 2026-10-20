// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
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
import { getDeviceTimezone } from "@/lib/timezone";
import { toLocalDateKey } from "@/lib/date-utils";

/**
 * The Today screen's slot actions on a past day (every dose is late there,
 * so no clock is needed): the "Mark all doses" modal shows the buttons of
 * the section 4.4 table for each slot state, and each bulk action changes
 * only the doses it should.
 */

function regimen(name: string) {
  const created = new Date(2026, 0, 1).getTime();
  const prescription = makePrescription({ genericName: name, createdAt: created });
  const phase = makeMedicationPhase(prescription.id, { startDate: created });
  const schedule = makePhaseSchedule(phase.id, {
    dosage: 50,
    time: "08:30",
    anchorTimezone: getDeviceTimezone(),
    createdAt: created,
  });
  const inventory = makeInventoryItem(prescription.id, {
    brandName: `${name} brand`,
    strength: 50,
    currentStock: 30,
  });
  return { prescription, phase, schedule, inventory };
}
type Regimen = ReturnType<typeof regimen>;

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function logFor(r: Regimen, date: Date, status: "taken" | "skipped") {
  return makeDoseLog(r.prescription.id, r.phase.id, r.schedule.id, {
    scheduledDate: toLocalDateKey(date),
    scheduledTime: "08:30",
    status,
    actionTimestamp: date.getTime(),
    ...(status === "taken" && { inventoryItemId: r.inventory.id, pillsConsumed: 1 }),
    ...(status === "skipped" && { skipReason: "Cost" }),
  });
}

async function renderSlot(regs: Regimen[], logs: ReturnType<typeof logFor>[] = [], date = yesterday()) {
  await renderWithFixtures(
    <>
      <ScheduleView selectedDate={date} onAddMed={() => {}} />
      <Toaster />
    </>,
    {
      seed: {
        prescriptions: regs.map((r) => r.prescription),
        medicationPhases: regs.map((r) => r.phase),
        phaseSchedules: regs.map((r) => r.schedule),
        inventoryItems: regs.map((r) => r.inventory),
        doseLogs: logs,
      },
    },
  );
  await screen.findByText(`${regs[0]!.prescription.genericName} brand`);
}

async function openModal() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Mark all doses" }));
  const modal = await screen.findByTestId("mark-all-doses");
  return { user, modal };
}

function bar(modal: HTMLElement) {
  const names = ["Skip all", "Unskip all", "Take all", "Untake all", "Reschedule"];
  return names.filter((name) => within(modal).queryByRole("button", { name }));
}

describe('"Mark all doses" modal: buttons per slot state', () => {
  it("every dose open: Skip all, Take all and Reschedule", async () => {
    await renderSlot([regimen("A"), regimen("B")]);
    const { modal } = await openModal();
    expect(bar(modal)).toEqual(["Skip all", "Take all", "Reschedule"]);
    expect(within(modal).getByRole("heading", { name: "08:30" })).toBeInTheDocument();
  });

  it("one taken, one open: Skip all, Take all, and Untake all as a text button", async () => {
    const a = regimen("A");
    const b = regimen("B");
    await renderSlot([a, b], [logFor(a, yesterday(), "taken")]);
    const { modal } = await openModal();
    expect(bar(modal)).toEqual(["Skip all", "Take all", "Untake all", "Reschedule"]);
  });

  it("every dose taken: Untake all in place of Take all", async () => {
    const a = regimen("A");
    const b = regimen("B");
    await renderSlot([a, b], [logFor(a, yesterday(), "taken"), logFor(b, yesterday(), "taken")]);
    const { modal } = await openModal();
    expect(bar(modal)).toEqual(["Untake all"]);
  });

  it("every dose skipped: Unskip all in place of Skip all", async () => {
    const a = regimen("A");
    const b = regimen("B");
    await renderSlot([a, b], [logFor(a, yesterday(), "skipped"), logFor(b, yesterday(), "skipped")]);
    const { modal } = await openModal();
    expect(bar(modal)).toEqual(["Unskip all"]);
  });

  it("one taken, one skipped: Unskip all and Untake all", async () => {
    const a = regimen("A");
    const b = regimen("B");
    await renderSlot([a, b], [logFor(a, yesterday(), "taken"), logFor(b, yesterday(), "skipped")]);
    const { modal } = await openModal();
    expect(bar(modal)).toEqual(["Unskip all", "Untake all"]);
  });

  it("a future day: only Reschedule in the modal, and no Take on the rows", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    await renderSlot([regimen("A"), regimen("B")], [], future);
    expect(screen.queryByRole("button", { name: /^Take / })).not.toBeInTheDocument();
    const { modal } = await openModal();
    expect(bar(modal)).toEqual(["Reschedule"]);
  });

  it("shows the date under the time on a day that is not today, and the late warning", async () => {
    await renderSlot([regimen("A"), regimen("B")]);
    const { modal } = await openModal();
    expect(within(modal).getByText(/^[A-Z][a-z]+day, [A-Z][a-z]{2} \d{1,2}$/)).toBeInTheDocument();
    expect(within(modal).getByTestId("late-warning")).toHaveTextContent(
      "You have not marked these doses. Consider if it is safe to take them now.",
    );
  });
});

describe('"Mark all doses" actions', () => {
  it("Take all on a past day asks the time; Take at a specific time records it on every open dose", async () => {
    const a = regimen("A");
    const b = regimen("B");
    await renderSlot([a, b]);
    const { user, modal } = await openModal();
    await user.click(within(modal).getByRole("button", { name: "Take all" }));
    await screen.findByText("When did you take your meds?");
    await user.click(screen.getByRole("button", { name: "Take at a specific time" }));
    // Default: when the doses were due (08:30 that day).
    expect((screen.getByLabelText("Time taken") as HTMLInputElement).value).toBe("08:30");
    expect((screen.getByLabelText("Date taken") as HTMLInputElement).value).toBe(toLocalDateKey(yesterday()));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const d = yesterday();
    const expected = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 30).getTime();
    await waitFor(async () => {
      const logs = await db.doseLogs.toArray();
      expect(logs).toHaveLength(2);
      for (const log of logs) expect(log).toMatchObject({ status: "taken", actionTimestamp: expected });
    });
    // The result shows in the modal (and in the Undo toast).
    expect((await screen.findAllByText("2 meds taken")).length).toBeGreaterThan(0);
  });

  it("Take all, then the sheet's Skip: skips the five open doses, leaves the taken one, asks why", async () => {
    const regs = ["A", "B", "C", "D", "E", "F"].map(regimen);
    const d = yesterday();
    const at0835 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 35).getTime();
    const taken = { ...logFor(regs[0]!, d, "taken"), actionTimestamp: at0835 };
    await renderSlot(regs, [taken]);
    const { user, modal } = await openModal();
    await user.click(within(modal).getByRole("button", { name: "Take all" }));
    await screen.findByText("When did you take your meds?");
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(async () => {
      expect((await db.doseLogs.toArray()).filter((l) => l.status === "skipped")).toHaveLength(5);
    });
    expect(await db.doseLogs.get(taken.id)).toMatchObject({ status: "taken", actionTimestamp: at0835 });
    expect((await db.inventoryItems.get(regs[0]!.inventory.id))?.currentStock).toBe(30);
    expect(await screen.findByText("Why are you skipping this dose?")).toBeInTheDocument();
  });

  it("the sheet's Skip on a dose that is already skipped leaves its reason and time", async () => {
    const r = regimen("A");
    const skipped = logFor(r, yesterday(), "skipped");
    await renderSlot([r], [skipped]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Take A brand" }));
    await screen.findByText(/^When did you take/);
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(screen.queryByText(/^When did you take/)).not.toBeInTheDocument());
    expect(await db.doseLogs.get(skipped.id)).toMatchObject({
      status: "skipped",
      skipReason: "Cost",
      actionTimestamp: skipped.actionTimestamp,
    });
    expect(screen.queryByText("Why are you skipping this dose?")).not.toBeInTheDocument();
  });

  it("Skip all skips only the open doses, then asks why; the reason goes on all of them", async () => {
    const a = regimen("A");
    const b = regimen("B");
    const c = regimen("C");
    const taken = logFor(a, yesterday(), "taken");
    await renderSlot([a, b, c], [taken]);
    const { user, modal } = await openModal();
    await user.click(within(modal).getByRole("button", { name: "Skip all" }));

    // The skip is written before the reason is asked.
    await waitFor(async () => {
      expect((await db.doseLogs.toArray()).filter((l) => l.status === "skipped")).toHaveLength(2);
    });
    await screen.findByText("Why are you skipping this dose?");
    await user.click(screen.getByRole("button", { name: "Forgot / busy / asleep" }));
    await waitFor(async () => {
      const skipped = (await db.doseLogs.toArray()).filter((l) => l.status === "skipped");
      expect(skipped.map((l) => l.skipReason)).toEqual(["Forgot / busy / asleep", "Forgot / busy / asleep"]);
    });
    expect((await db.doseLogs.get(taken.id))?.status).toBe("taken");
  });

  it("dismissing the reason sheet leaves the doses skipped with no reason", async () => {
    await renderSlot([regimen("A"), regimen("B")]);
    const { user, modal } = await openModal();
    await user.click(within(modal).getByRole("button", { name: "Skip all" }));
    await screen.findByText("Why are you skipping this dose?");
    await user.click(screen.getByRole("button", { name: "No reason" }));
    const logs = await db.doseLogs.toArray();
    expect(logs.map((l) => l.status)).toEqual(["skipped", "skipped"]);
    expect(logs.every((l) => l.skipReason === undefined)).toBe(true);
  });

  it("Untake all puts the pills back; Undo takes them out again", async () => {
    const a = regimen("A");
    const b = regimen("B");
    await renderSlot([a, b], [logFor(a, yesterday(), "taken"), logFor(b, yesterday(), "taken")]);
    const { modal } = await openModal();
    // The modal stays open in jsdom (no exit animation): click past it.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(within(modal).getByRole("button", { name: "Untake all" }));
    await waitFor(async () => {
      expect((await db.inventoryItems.get(a.inventory.id))?.currentStock).toBe(31);
    });
    expect((await db.doseLogs.toArray()).map((l) => l.status)).toEqual(["pending", "pending"]);

    // jsdom never ends the drawer's exit animation, so the page behind stays
    // aria-hidden: look past it for the toast.
    await user.click(await screen.findByRole("button", { name: /^undo/i, hidden: true }));
    await waitFor(async () => {
      expect((await db.inventoryItems.get(a.inventory.id))?.currentStock).toBe(30);
      expect((await db.doseLogs.toArray()).map((l) => l.status)).toEqual(["taken", "taken"]);
    });
  });

  it("Unskip all opens the skipped doses again and clears the reason", async () => {
    const a = regimen("A");
    const b = regimen("B");
    await renderSlot([a, b], [logFor(a, yesterday(), "skipped"), logFor(b, yesterday(), "skipped")]);
    const { user, modal } = await openModal();
    await user.click(within(modal).getByRole("button", { name: "Unskip all" }));
    await waitFor(async () => {
      const logs = await db.doseLogs.toArray();
      expect(logs.map((l) => l.status)).toEqual(["pending", "pending"]);
      expect(logs.every((l) => l.skipReason === undefined)).toBe(true);
    });
  });

  it("a tap on a row in the modal opens its dose dialog", async () => {
    await renderSlot([regimen("A"), regimen("B")]);
    const { user, modal } = await openModal();
    await user.click(within(modal).getAllByRole("button", { name: /Open dose/ })[0]!);
    expect(await screen.findByText(/Scheduled for 08:30/)).toBeInTheDocument();
  });

  it("Undo after a row Take reverts that dose and restores its stock", async () => {
    const r = regimen("A");
    await renderSlot([r]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Take A brand" }));
    // A past-day dose is past its late window: the sheet asks.
    await user.click(await screen.findByRole("button", { name: /^Take now/ }));
    await waitFor(async () => {
      expect((await db.inventoryItems.get(r.inventory.id))?.currentStock).toBe(29);
    });

    // jsdom never ends the drawer's exit animation, so the page behind stays
    // aria-hidden: look past it for the toast.
    await user.click(await screen.findByRole("button", { name: /^undo/i, hidden: true }));
    await waitFor(async () => {
      const logs = await db.doseLogs.where("scheduleId").equals(r.schedule.id).toArray();
      expect(logs[0]?.status).toBe("pending");
    });
    expect((await db.inventoryItems.get(r.inventory.id))?.currentStock).toBe(30);
  });
});

describe("Take now records the current time", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Take all, then Take now at 09:30, records 09:30 on every open dose", async () => {
    const today = new Date();
    const nineThirty = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 30).getTime();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(nineThirty);
    await renderSlot([regimen("A"), regimen("B")]);
    const { user, modal } = await openModal();
    await user.click(within(modal).getByRole("button", { name: "Take all" }));
    await user.click(await screen.findByRole("button", { name: /^Take now/ }));
    await waitFor(async () => {
      const logs = await db.doseLogs.toArray();
      expect(logs).toHaveLength(2);
      for (const log of logs) expect(log).toMatchObject({ status: "taken", actionTimestamp: nineThirty });
    });
  });
});
