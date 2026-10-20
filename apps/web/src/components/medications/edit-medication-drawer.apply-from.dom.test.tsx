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
        description: "The change starts Thursday, Oct 22. Until then, the old schedule stays.",
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
});
