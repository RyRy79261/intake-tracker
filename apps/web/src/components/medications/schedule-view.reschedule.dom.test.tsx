// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
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
 * Rescheduling on the Today screen, with the clock fixed at 12:00 on
 * 2026-10-19: the reschedule sheet from the dose dialog and from the "Mark
 * all doses" modal, the row and dialog states of a rescheduled dose,
 * "Cancel reschedule", and the "Moved to today" group.
 */

/** Each test walks a few sheets; under a loaded full run that can pass 5 s. */
vi.setConfig({ testTimeout: 20_000 });

const at = (h: number, m: number, day = 0) => new Date(2026, 9, 19 + day, h, m).getTime();
const TODAY = new Date(2026, 9, 19);
const YESTERDAY = new Date(2026, 9, 18);

function regimen(name: string, time = "08:30") {
  const created = new Date(2026, 0, 1).getTime();
  const prescription = makePrescription({ genericName: name, createdAt: created });
  const phase = makeMedicationPhase(prescription.id, { startDate: created });
  const schedule = makePhaseSchedule(phase.id, {
    dosage: 50,
    time,
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

function rescheduledLog(r: Regimen, date: Date, remindAt: number) {
  return makeDoseLog(r.prescription.id, r.phase.id, r.schedule.id, {
    scheduledDate: toLocalDateKey(date),
    scheduledTime: r.schedule.time,
    status: "rescheduled",
    remindAt,
    actionTimestamp: at(8, 0),
  });
}

function takenLog(r: Regimen, date: Date) {
  return makeDoseLog(r.prescription.id, r.phase.id, r.schedule.id, {
    scheduledDate: toLocalDateKey(date),
    scheduledTime: r.schedule.time,
    status: "taken",
    actionTimestamp: at(8, 35),
    inventoryItemId: r.inventory.id,
    pillsConsumed: 1,
  });
}

async function renderDay(regs: Regimen[], logs: ReturnType<typeof makeDoseLog>[] = [], date = TODAY) {
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
  await screen.findAllByText(`${regs[0]!.prescription.genericName} brand`);
}

const logsOf = (r: Regimen) => db.doseLogs.where("scheduleId").equals(r.schedule.id).toArray();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at(12, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the reschedule sheet from the dose dialog", () => {
  it("moves the dose: it stays under 08:30 with \"Rescheduled for 13:00\"; Undo puts it back", async () => {
    const a = regimen("A");
    await renderDay([a]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^A brand, .*Open dose$/ }));
    await user.click(await screen.findByRole("button", { name: "Reschedule" }));

    const sheet = await screen.findByTestId("reschedule-sheet");
    expect(within(sheet).getByRole("heading", { name: "Reschedule for" })).toBeInTheDocument();
    // Default: 30 minutes from now.
    expect(within(sheet).getByLabelText("Reschedule time")).toHaveValue("12:30");
    // A quick pick with no warning saves in one tap.
    await user.click(within(sheet).getByRole("button", { name: "+1 hour" }));

    await waitFor(async () => {
      expect((await logsOf(a))[0]).toMatchObject({ status: "rescheduled", remindAt: at(13, 0) });
    });
    const slot = screen.getByTestId("time-slot");
    expect(slot).toHaveAttribute("data-time", "08:30");
    expect(within(slot).getByTestId("dose-status")).toHaveTextContent("Rescheduled for 13:00");
    expect(within(slot).getByTestId("dose-row")).toHaveAttribute("data-status", "rescheduled");

    await user.click(await screen.findByRole("button", { name: /^undo/i, hidden: true }));
    await waitFor(async () => {
      const [log] = await logsOf(a);
      expect(log?.status).toBe("pending");
      expect(log?.remindAt).toBeUndefined();
    });
  });

  it('warns "This time has passed" and after the next dose of the same med, and still saves', async () => {
    const a = regimen("A");
    const evening = makePhaseSchedule(a.phase.id, {
      dosage: 50,
      time: "20:30",
      anchorTimezone: getDeviceTimezone(),
      createdAt: new Date(2026, 0, 1).getTime(),
    });
    await renderWithFixtures(<ScheduleView selectedDate={TODAY} onAddMed={() => {}} />, {
      seed: {
        prescriptions: [a.prescription],
        medicationPhases: [a.phase],
        phaseSchedules: [a.schedule, evening],
        inventoryItems: [a.inventory],
      },
    });
    const user = userEvent.setup();
    const [morningRow] = await screen.findAllByRole("button", { name: /^A brand, .*Open dose$/ });
    await user.click(morningRow!);
    await user.click(await screen.findByRole("button", { name: "Reschedule" }));
    const sheet = await screen.findByTestId("reschedule-sheet");

    const time = within(sheet).getByLabelText("Reschedule time");
    // 11:45: inside the 30-minute reminder period, so the dose still waits.
    await user.clear(time);
    await user.type(time, "11:45");
    expect(await within(sheet).findByText("This time has passed. Its first reminder may not fire.")).toBeInTheDocument();
    // 11:00: the period has ended too.
    await user.clear(time);
    await user.type(time, "11:00");
    expect(await within(sheet).findByText("This time has passed. The dose shows as missed.")).toBeInTheDocument();

    await user.clear(time);
    await user.type(time, "21:00");
    expect(await within(sheet).findByText("This is after your next A brand dose at 20:30.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Reschedule" }));
    await waitFor(async () => {
      const log = (await logsOf(a)).find((l) => l.scheduleId === a.schedule.id);
      expect(log).toMatchObject({ status: "rescheduled", remindAt: at(21, 0) });
    });
  });

  it("the next-dose warning names the day when that dose is not today", async () => {
    const a = regimen("A");
    await renderDay([a]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^A brand, .*Open dose$/ }));
    await user.click(await screen.findByRole("button", { name: "Reschedule" }));
    const sheet = await screen.findByTestId("reschedule-sheet");
    await user.click(within(sheet).getByRole("button", { name: "Tomorrow" }));
    const time = within(sheet).getByLabelText("Reschedule time");
    await user.clear(time);
    await user.type(time, "09:00");
    expect(await within(sheet).findByText("This is after your next A brand dose at 08:30, tomorrow.")).toBeInTheDocument();
  });

  it("a quick pick with a warning fills in the time and waits for Reschedule", async () => {
    const a = regimen("A");
    const noon = makePhaseSchedule(a.phase.id, {
      dosage: 50,
      time: "12:20",
      anchorTimezone: getDeviceTimezone(),
      createdAt: new Date(2026, 0, 1).getTime(),
    });
    await renderWithFixtures(<ScheduleView selectedDate={TODAY} onAddMed={() => {}} />, {
      seed: {
        prescriptions: [a.prescription],
        medicationPhases: [a.phase],
        phaseSchedules: [a.schedule, noon],
        inventoryItems: [a.inventory],
      },
    });
    const user = userEvent.setup();
    const [morningRow] = await screen.findAllByRole("button", { name: /^A brand, .*Open dose$/ });
    await user.click(morningRow!);
    await user.click(await screen.findByRole("button", { name: "Reschedule" }));
    const sheet = await screen.findByTestId("reschedule-sheet");
    await user.click(within(sheet).getByRole("button", { name: "+30 min" }));
    expect(await within(sheet).findByText("This is after your next A brand dose at 12:20.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Reschedule time")).toHaveValue("12:30");
    expect(await db.doseLogs.count()).toBe(0);
    await user.click(within(sheet).getByRole("button", { name: "Reschedule" }));
    await waitFor(async () => {
      const log = (await logsOf(a)).find((l) => l.scheduleId === a.schedule.id);
      expect(log).toMatchObject({ status: "rescheduled", remindAt: at(12, 30) });
    });
  });

  it("a rescheduled dose's dialog shows both times and Cancel reschedule", async () => {
    const a = regimen("A");
    await renderDay([a], [rescheduledLog(a, TODAY, at(13, 0))]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^A brand, .*Open dose$/ }));
    expect(await screen.findByText(/Scheduled for 08:30/)).toBeInTheDocument();
    expect(screen.getByTestId("dialog-status")).toHaveTextContent("Rescheduled for 13:00");
    await user.click(screen.getByRole("button", { name: "Cancel reschedule" }));
    await waitFor(async () => {
      const [log] = await logsOf(a);
      expect(log?.status).toBe("pending");
      expect(log?.remindAt).toBeUndefined();
    });
  });

  it("a taken dose has no Reschedule", async () => {
    const a = regimen("A");
    await renderDay([a], [takenLog(a, TODAY)]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^A brand, .*Open dose$/ }));
    expect(await screen.findByRole("button", { name: "Untake" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel reschedule" })).not.toBeInTheDocument();
  });

  it("the slot header is not missed while a dose waits for a later time", async () => {
    const a = regimen("A");
    const b = regimen("B");
    // 12:00: B (08:30, no action) is missed; A waits for 13:00.
    await renderDay([a, b], [rescheduledLog(a, TODAY, at(13, 0))]);
    expect(screen.getByTestId("slot-time")).not.toHaveClass("text-sodium");
  });
});

describe('"Reschedule" in the "Mark all doses" modal', () => {
  it("moves only the open doses; the result and Undo", async () => {
    const a = regimen("A");
    const b = regimen("B");
    const c = regimen("C");
    await renderDay([a, b, c], [takenLog(a, TODAY)]);
    // The modal stays open in jsdom (no exit animation): click past it.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole("button", { name: "Mark all doses" }));
    const modal = await screen.findByTestId("mark-all-doses");
    await user.click(within(modal).getByRole("button", { name: "Reschedule" }));
    const sheet = await screen.findByTestId("reschedule-sheet");
    await user.click(within(sheet).getByRole("button", { name: "+2 hours" }));

    // jsdom never ends the sheet's exit animation, so the modal stays
    // aria-hidden behind it: look past that.
    expect(await within(modal).findByRole("status", { hidden: true })).toHaveTextContent(
      "2 meds rescheduled for 14:00",
    );
    expect((await logsOf(a))[0]).toMatchObject({ status: "taken", actionTimestamp: at(8, 35) });
    expect((await logsOf(b))[0]).toMatchObject({ status: "rescheduled", remindAt: at(14, 0) });
    expect((await logsOf(c))[0]).toMatchObject({ status: "rescheduled", remindAt: at(14, 0) });

    await user.click(await screen.findByRole("button", { name: /^undo/i, hidden: true }));
    await waitFor(async () => {
      expect((await logsOf(b))[0]?.status).toBe("pending");
      expect((await logsOf(c))[0]?.status).toBe("pending");
    });
    expect((await logsOf(a))[0]).toMatchObject({ status: "taken", actionTimestamp: at(8, 35) });
  });

  it("Cancel in the sheet writes nothing", async () => {
    const a = regimen("A");
    const b = regimen("B");
    await renderDay([a, b]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mark all doses" }));
    const modal = await screen.findByTestId("mark-all-doses");
    await user.click(within(modal).getByRole("button", { name: "Reschedule" }));
    const sheet = await screen.findByTestId("reschedule-sheet");
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(await db.doseLogs.count()).toBe(0);
  });

  it("on a future day the quick picks count from the dose time", async () => {
    const a = regimen("A");
    const b = regimen("B");
    const future = new Date(2026, 9, 21);
    await renderDay([a, b], [], future);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mark all doses" }));
    const modal = await screen.findByTestId("mark-all-doses");
    await user.click(within(modal).getByRole("button", { name: "Reschedule" }));
    const sheet = await screen.findByTestId("reschedule-sheet");
    // Default: the dose time + 30 minutes, on that day.
    expect(within(sheet).getByLabelText("Reschedule time")).toHaveValue("09:00");
    expect(within(sheet).getByLabelText("Reschedule date")).toHaveValue("2026-10-21");
    // Today is before the doses' day and still allowed.
    expect(within(sheet).getByRole("button", { name: "Today" })).toBeEnabled();
    await user.click(within(sheet).getByRole("button", { name: "+15 min" }));
    await waitFor(async () => {
      expect((await logsOf(a))[0]).toMatchObject({ status: "rescheduled", remindAt: at(8, 45, 2) });
      expect((await logsOf(b))[0]).toMatchObject({ status: "rescheduled", remindAt: at(8, 45, 2) });
    });
  });

  it("a future day's dose can move to a day before its own (today 20:00)", async () => {
    const a = regimen("A");
    await renderDay([a], [], new Date(2026, 9, 21));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^A brand[,.] .*Open dose$/ }));
    await user.click(await screen.findByRole("button", { name: "Reschedule" }));
    const sheet = await screen.findByTestId("reschedule-sheet");
    const date = within(sheet).getByLabelText("Reschedule date");
    expect(date).not.toHaveAttribute("min");
    await user.click(within(sheet).getByRole("button", { name: "Today" }));
    const time = within(sheet).getByLabelText("Reschedule time");
    await user.clear(time);
    await user.type(time, "20:00");
    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    const save = within(sheet).getByRole("button", { name: "Reschedule" });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(async () => {
      expect((await logsOf(a))[0]).toMatchObject({
        status: "rescheduled",
        scheduledDate: "2026-10-21",
        remindAt: at(20, 0),
      });
    });
  });
});

describe('"Moved to today"', () => {
  it("shows a dose of yesterday rescheduled into today, with where it comes from", async () => {
    const a = regimen("A", "22:00");
    await renderDay([a], [rescheduledLog(a, YESTERDAY, at(12, 30))]);
    const group = await screen.findByTestId("carried-over");
    expect(within(group).getByRole("heading", { name: "Moved to today" })).toBeInTheDocument();
    expect(within(group).getByTestId("dose-origin")).toHaveTextContent("From Sunday, Oct 18, 22:00");
    expect(within(group).getByTestId("dose-status")).toHaveTextContent("Rescheduled for 12:30, today");

    // Take on it writes yesterday's log, at now.
    const user = userEvent.setup();
    await user.click(within(group).getByRole("button", { name: "Take A brand" }));
    await waitFor(async () => {
      const logs = await logsOf(a);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        status: "taken",
        scheduledDate: toLocalDateKey(YESTERDAY),
        actionTimestamp: at(12, 0),
      });
    });
    await waitFor(() => expect(screen.queryByTestId("carried-over")).not.toBeInTheDocument());
  });

  it("shows tomorrow's dose moved to today 20:00; Take works from the row and the dialog", async () => {
    const a = regimen("A");
    const b = regimen("B");
    const TOMORROW = new Date(2026, 9, 20);
    await renderDay([a, b], [rescheduledLog(a, TOMORROW, at(20, 0)), rescheduledLog(b, TOMORROW, at(20, 0))]);
    const group = await screen.findByTestId("carried-over");
    expect(within(group).getByRole("heading", { name: "Moved to today" })).toBeInTheDocument();
    expect(within(group).getAllByTestId("dose-origin")[0]).toHaveTextContent("From Tuesday, Oct 20, 08:30");
    expect(within(group).getAllByTestId("dose-status")[0]).toHaveTextContent("Rescheduled for 20:00, today");

    const user = userEvent.setup();
    await user.click(within(group).getByRole("button", { name: "Take A brand" }));
    await waitFor(async () => {
      expect((await logsOf(a))[0]).toMatchObject({
        status: "taken",
        scheduledDate: "2026-10-20",
        actionTimestamp: at(12, 0),
      });
    });
    expect((await db.inventoryItems.get(a.inventory.id))?.currentStock).toBe(29);

    // The dialog of the other one has Take (it is due today), not only Reschedule.
    await user.click(within(group).getByRole("button", { name: /^B brand[,.] .*Open dose$/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^Take/ }));
    await waitFor(async () => {
      expect((await logsOf(b))[0]).toMatchObject({ status: "taken", scheduledDate: "2026-10-20" });
    });
  });

  it("is only on today", async () => {
    const a = regimen("A", "22:00");
    await renderDay([a], [rescheduledLog(a, YESTERDAY, at(12, 30))], YESTERDAY);
    expect(screen.queryByTestId("carried-over")).not.toBeInTheDocument();
    // Yesterday still shows it under 22:00.
    expect(screen.getByTestId("dose-status")).toHaveTextContent("Rescheduled for 12:30, today");
  });
});

describe("the floating chip", () => {
  let observed: Element[] = [];
  let callback: IntersectionObserverCallback | null = null;
  beforeEach(() => {
    observed = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const allOffScreen = () =>
    act(() => {
      callback?.(
        observed.map((target) => ({ target, isIntersecting: false }) as unknown as IntersectionObserverEntry),
        {} as IntersectionObserver,
      );
    });

  it('says "Rescheduled meds" when only rescheduled doses are due off screen', async () => {
    const a = regimen("A");
    await renderDay([a], [rescheduledLog(a, TODAY, at(11, 45))]);
    await waitFor(() => expect(observed.length).toBeGreaterThan(0));
    allOffScreen();
    expect(await screen.findByRole("button", { name: "Rescheduled meds" })).toBeInTheDocument();
  });

  it('says "Unmarked meds" when an off-screen due dose is not rescheduled', async () => {
    const a = regimen("A");
    const b = regimen("B", "11:50");
    await renderDay([a, b], [rescheduledLog(a, TODAY, at(11, 45))]);
    await waitFor(() => expect(observed.length).toBeGreaterThan(1));
    allOffScreen();
    expect(await screen.findByRole("button", { name: "Unmarked meds" })).toBeInTheDocument();
  });
});
