// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@intake/ui/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
}));
vi.mock("@/hooks/use-medicine-search", () => ({
  useMedicineSearch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  searchMedicine: vi.fn(),
  MedicineSearchCancelledError: class MedicineSearchCancelledError extends Error {},
  MedicineSearchError: class MedicineSearchError extends Error {},
}));

import { PrescriptionViewDrawer } from "@/components/medications/edit-medication-drawer";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import {
  makeDoseLog,
  makeMedicationPhase,
  makePhaseSchedule,
  makePrescription,
} from "@/__tests__/fixtures/db-fixtures";
import { toLocalDateKey } from "@/lib/date-utils";

/** A local instant on 2026-10-19 (or `day` days later). */
const at = (h: number, m: number, day = 0) => new Date(2026, 9, 19 + day, h, m).getTime();
const TODAY = toLocalDateKey(at(12, 0));
const IN_3 = toLocalDateKey(at(12, 0, 3));

function seed(extra: { taken?: boolean } = {}) {
  const prescription = makePrescription({ genericName: "Lisinopril", createdAt: at(0, 0, -30) });
  const phase = makeMedicationPhase(prescription.id, { unit: "mg", startDate: at(0, 0, -30) });
  const schedule = makePhaseSchedule(phase.id, { time: "08:00", dosage: 10, createdAt: at(0, 0, -30) });
  const doseLogs = extra.taken
    ? [
        makeDoseLog(prescription.id, phase.id, schedule.id, {
          scheduledDate: TODAY,
          scheduledTime: "08:00",
          status: "taken",
          actionTimestamp: at(8, 5),
        }),
      ]
    : [];
  return {
    prescription,
    phase,
    schedule,
    seed: { prescriptions: [prescription], medicationPhases: [phase], phaseSchedules: [schedule], doseLogs },
  };
}

async function openAndEditTime(s: ReturnType<typeof seed>) {
  await renderWithFixtures(
    <PrescriptionViewDrawer prescription={s.prescription} open onOpenChange={() => {}} />,
    { seed: s.seed },
  );
  const time = await screen.findByDisplayValue("08:00");
  fireEvent.change(time, { target: { value: "09:00" } });
  return screen.findByLabelText("Apply from");
}

beforeEach(() => {
  toastSpy.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], now: at(10, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Schedule tab: Apply from", () => {
  it("shows after an edit, defaults to today and does not offer a past date", async () => {
    const applyFrom = await openAndEditTime(seed());
    expect(applyFrom).toHaveValue(TODAY);
    expect(applyFrom).toHaveAttribute("min", TODAY);
    expect(screen.getByText("Days before today keep the old schedule.")).toBeInTheDocument();
  });

  it("a past date shows an error and blocks Save", async () => {
    const applyFrom = await openAndEditTime(seed());
    fireEvent.change(applyFrom, { target: { value: toLocalDateKey(at(12, 0, -1)) } });
    expect(await screen.findByText("Pick today or a later date.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save schedule/i })).toBeDisabled();
  });

  it("a future date keeps the old time until it, and the drawer then says so", async () => {
    const user = userEvent.setup();
    const s = seed();
    const applyFrom = await openAndEditTime(s);
    fireEvent.change(applyFrom, { target: { value: IN_3 } });
    await user.click(screen.getByRole("button", { name: /save schedule/i }));

    await vi.waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith({
        title: "Schedule saved",
        description: "The change starts Thursday, Oct 22. Days before it keep their schedule.",
      }),
    );
    const rows = await db.phaseSchedules.where("phaseId").equals(s.phase.id).toArray();
    expect(rows.find((r) => r.id === s.schedule.id)).toMatchObject({ time: "08:00", effectiveTo: IN_3 });
    expect(rows.find((r) => r.id !== s.schedule.id)).toMatchObject({ time: "09:00", effectiveFrom: IN_3 });

    // The drawer edits the newest times and names the pending change.
    expect(await screen.findByText("A change starts Thursday, Oct 22.")).toBeInTheDocument();
    expect(screen.getByText(/08:00 10 mg/)).toBeInTheDocument();
    expect(await screen.findByDisplayValue("09:00")).toBeInTheDocument();
  });

  it("today's dose already taken: the change starts tomorrow, and the toast says why", async () => {
    const user = userEvent.setup();
    await openAndEditTime(seed({ taken: true }));
    await user.click(screen.getByRole("button", { name: /save schedule/i }));
    await vi.waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith({
        title: "Schedule saved",
        description: "Today's dose is already logged. The change starts tomorrow.",
      }),
    );
  });

  it("a food-instruction save leaves a pending change on its date", async () => {
    const user = userEvent.setup();
    const s = seed();
    const next = makePhaseSchedule(s.phase.id, { time: "09:00", dosage: 10, effectiveFrom: IN_3, createdAt: at(9, 0) });
    s.schedule.effectiveTo = IN_3;
    s.seed.phaseSchedules.push(next);
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={s.prescription} open onOpenChange={() => {}} />,
      { seed: s.seed },
    );
    expect(await screen.findByText("A change starts Thursday, Oct 22.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "After eating" }));
    expect(screen.queryByLabelText("Apply from")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save schedule/i }));

    await vi.waitFor(async () =>
      expect((await db.medicationPhases.get(s.phase.id))?.foodInstruction).toBe("after"),
    );
    expect(await db.phaseSchedules.get(s.schedule.id)).toMatchObject({ effectiveTo: IN_3 });
    expect(await db.phaseSchedules.get(next.id)).toMatchObject({ effectiveFrom: IN_3, deletedAt: null });
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("an edit with a pending change starts on its date by default", async () => {
    const s = seed();
    const next = makePhaseSchedule(s.phase.id, { time: "09:00", dosage: 10, effectiveFrom: IN_3, createdAt: at(9, 0) });
    s.schedule.effectiveTo = IN_3;
    s.seed.phaseSchedules.push(next);
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={s.prescription} open onOpenChange={() => {}} />,
      { seed: s.seed },
    );
    fireEvent.change(await screen.findByDisplayValue("09:00"), { target: { value: "10:00" } });
    expect(await screen.findByLabelText("Apply from")).toHaveValue(IN_3);
  });

  it("a removed time from a future date names the change and what runs until then", async () => {
    const user = userEvent.setup();
    const s = seed();
    const evening = makePhaseSchedule(s.phase.id, { time: "20:00", dosage: 10, createdAt: at(0, 0, -30) });
    s.seed.phaseSchedules.push(evening);
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={s.prescription} open onOpenChange={() => {}} />,
      { seed: s.seed },
    );
    await screen.findByDisplayValue("20:00");
    await user.click(screen.getAllByRole("button", { name: "Remove dose" })[1]!);
    fireEvent.change(await screen.findByLabelText("Apply from"), { target: { value: IN_3 } });
    await user.click(screen.getByRole("button", { name: /save schedule/i }));

    expect(await screen.findByText("A change starts Thursday, Oct 22.")).toBeInTheDocument();
    expect(screen.getByText("08:00 10 mg, 20:00 10 mg")).toBeInTheDocument();
    expect(await db.phaseSchedules.get(evening.id)).toMatchObject({ effectiveTo: IN_3 });
  });

  it("two pending changes are both listed in date order", async () => {
    const s = seed();
    const IN_1 = toLocalDateKey(at(12, 0, 1));
    s.schedule.effectiveTo = IN_1;
    s.seed.phaseSchedules.push(
      makePhaseSchedule(s.phase.id, {
        time: "09:00",
        dosage: 10,
        effectiveFrom: IN_1,
        effectiveTo: IN_3,
        createdAt: at(9, 0),
      }),
      makePhaseSchedule(s.phase.id, { time: "10:00", dosage: 10, effectiveFrom: IN_3, createdAt: at(9, 5) }),
    );
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={s.prescription} open onOpenChange={() => {}} />,
      { seed: s.seed },
    );
    expect(await screen.findByText("2 changes are saved.")).toBeInTheDocument();
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Now: 08:00 10 mg");
    expect(notice).toHaveTextContent("From tomorrow: 09:00 10 mg");
    expect(notice).toHaveTextContent("From Thursday, Oct 22: 10:00 10 mg");
    expect(notice).toHaveTextContent("The form shows the schedule from Thursday, Oct 22.");
    expect(await screen.findByDisplayValue("10:00")).toBeInTheDocument();
  });
});
