import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  activatePhase,
  startNewPhase,
  updatePhase,
  deletePhase,
  getActivePhaseForPrescription,
  getPhasesForPrescription,
  type CreatePhaseInput,
} from "@/lib/phase-service";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";
import { localHHMMStringToUTCMinutes } from "@/lib/timezone";
import { toLocalDateKey } from "@/lib/date-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDetails(details: string | undefined): Record<string, unknown> {
  return JSON.parse(details ?? "{}") as Record<string, unknown>;
}

async function auditsByAction(action: string) {
  const all = await db.auditLogs.toArray();
  return all.filter((a) => a.action === action);
}

async function syncRowsFor(tableName: string, recordId: string) {
  return db._syncQueue
    .where("[tableName+recordId]")
    .equals([tableName, recordId])
    .toArray();
}

/** The phase's one live row that no "Apply from" edit has closed. */
async function openRow(phaseId: string) {
  const rows = (await db.phaseSchedules.where("phaseId").equals(phaseId).toArray()).filter(
    (s) => s.deletedAt == null && !s.effectiveTo,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

function makeCreateInput(prescriptionId: string, overrides?: Partial<CreatePhaseInput>): CreatePhaseInput {
  return {
    prescriptionId,
    type: "maintenance",
    unit: "mg",
    startDate: Date.now() - 1000,
    foodInstruction: "none",
    schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 50 }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// activatePhase — exactly one active phase per prescription
// ---------------------------------------------------------------------------

describe("activatePhase", () => {
  it("completes the currently-active phase and activates the target", async () => {
    const rx = makePrescription();
    const active = makeMedicationPhase(rx.id, { status: "active" });
    const pending = makeMedicationPhase(rx.id, { status: "pending" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.bulkAdd([active, pending]);

    const result = await activatePhase(pending.id);
    expect(result.success).toBe(true);

    const completed = await db.medicationPhases.get(active.id);
    const activated = await db.medicationPhases.get(pending.id);
    expect(completed!.status).toBe("completed");
    expect(typeof completed!.endDate).toBe("number");
    expect(activated!.status).toBe("active");

    // Invariant: exactly one active phase for the prescription
    const stillActive = await getActivePhaseForPrescription(rx.id);
    expect(stillActive!.id).toBe(pending.id);
    const allActive = (await db.medicationPhases.where("prescriptionId").equals(rx.id).toArray())
      .filter((p) => p.status === "active");
    expect(allActive).toHaveLength(1);
  });

  it("writes phase_completed + phase_activated audits and sync-queue rows", async () => {
    const rx = makePrescription();
    const active = makeMedicationPhase(rx.id, { status: "active" });
    const pending = makeMedicationPhase(rx.id, { status: "pending" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.bulkAdd([active, pending]);

    await activatePhase(pending.id);

    const completedAudits = await auditsByAction("phase_completed");
    const activatedAudits = await auditsByAction("phase_activated");
    expect(completedAudits).toHaveLength(1);
    expect(activatedAudits).toHaveLength(1);
    expect(parseDetails(completedAudits[0]!.details).phaseId).toBe(active.id);
    expect(parseDetails(activatedAudits[0]!.details).phaseId).toBe(pending.id);

    // Both phases enqueued for sync as upserts.
    const activeSync = await syncRowsFor("medicationPhases", active.id);
    const pendingSync = await syncRowsFor("medicationPhases", pending.id);
    expect(activeSync).toHaveLength(1);
    expect(activeSync[0]!.op).toBe("upsert");
    expect(pendingSync).toHaveLength(1);
    expect(pendingSync[0]!.op).toBe("upsert");
  });

  it("activates with no prior active phase (no completion audit)", async () => {
    const rx = makePrescription();
    const pending = makeMedicationPhase(rx.id, { status: "pending" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(pending);

    await activatePhase(pending.id);

    expect(await auditsByAction("phase_completed")).toHaveLength(0);
    expect(await auditsByAction("phase_activated")).toHaveLength(1);
    expect((await db.medicationPhases.get(pending.id))!.status).toBe("active");
  });

  it("errors when the phase does not exist", async () => {
    const result = await activatePhase("nonexistent");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// startNewPhase — single active phase invariant + future-dated pending
// ---------------------------------------------------------------------------

describe("startNewPhase", () => {
  it("completes the previously-active phase when the new phase starts now", async () => {
    const rx = makePrescription();
    const active = makeMedicationPhase(rx.id, { status: "active" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(active);

    const result = await startNewPhase(makeCreateInput(rx.id));
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.status).toBe("active");
    const oldPhase = await db.medicationPhases.get(active.id);
    expect(oldPhase!.status).toBe("completed");
    expect(typeof oldPhase!.endDate).toBe("number");

    // Invariant holds.
    const allActive = (await db.medicationPhases.where("prescriptionId").equals(rx.id).toArray())
      .filter((p) => p.status === "active");
    expect(allActive).toHaveLength(1);
    expect(allActive[0]!.id).toBe(result.data.id);
  });

  it("seeds the new phase's schedules and enqueues each for sync", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    const result = await startNewPhase(
      makeCreateInput(rx.id, {
        schedules: [
          { time: "08:00", daysOfWeek: [1, 2, 3], dosage: 25 },
          { time: "20:00", daysOfWeek: [4, 5], dosage: 50 },
        ],
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    const schedules = await db.phaseSchedules.where("phaseId").equals(result.data.id).toArray();
    expect(schedules).toHaveLength(2);
    for (const s of schedules) {
      const sync = await syncRowsFor("phaseSchedules", s.id);
      expect(sync).toHaveLength(1);
      expect(sync[0]!.op).toBe("upsert");
    }

    const started = await auditsByAction("phase_started");
    expect(started).toHaveLength(1);
    expect(parseDetails(started[0]!.details).status).toBe("active");
  });

  it("future-dated startDate yields status 'pending' and does NOT complete the active phase", async () => {
    const rx = makePrescription();
    const active = makeMedicationPhase(rx.id, { status: "active" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(active);

    const result = await startNewPhase(
      makeCreateInput(rx.id, { startDate: Date.now() + 7 * 24 * 60 * 60 * 1000 }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.status).toBe("pending");

    // The existing active phase is untouched — no completion.
    const oldPhase = await db.medicationPhases.get(active.id);
    expect(oldPhase!.status).toBe("active");
    expect(oldPhase!.endDate).toBeUndefined();
    expect(await auditsByAction("phase_completed")).toHaveLength(0);

    // The phase_started audit records the pending status.
    const started = await auditsByAction("phase_started");
    expect(started).toHaveLength(1);
    expect(parseDetails(started[0]!.details).status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// updatePhase — schedule reconciliation partitions add/update/delete
// ---------------------------------------------------------------------------

describe("updatePhase schedule reconciliation", () => {
  it("closes changed and removed rows at today and adds the new rows from today", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const keep = makePhaseSchedule(phase.id, { time: "08:00", dosage: 50 });
    const drop = makePhaseSchedule(phase.id, { time: "20:00", dosage: 50 });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.bulkAdd([keep, drop]);
    const today = toLocalDateKey();

    const result = await updatePhase({
      id: phase.id,
      schedules: [
        // existing → changed (dosage change)
        { id: keep.id, time: "08:00", daysOfWeek: [1, 2], dosage: 100 },
        // no id → added
        { time: "12:00", daysOfWeek: [3], dosage: 25 },
        // `drop` omitted → removed
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.scheduleChange).toEqual({ applyFrom: today });

    const rows = await db.phaseSchedules.where("phaseId").equals(phase.id).toArray();
    // Both old rows ran before today: they stay as history, closed at today.
    expect(rows.find((r) => r.id === keep.id)).toMatchObject({ dosage: 50, effectiveTo: today, deletedAt: null });
    expect(rows.find((r) => r.id === drop.id)).toMatchObject({ effectiveTo: today, deletedAt: null });

    const fresh = rows.filter((r) => r.id !== keep.id && r.id !== drop.id);
    expect(fresh).toHaveLength(2);
    expect(fresh.every((r) => r.effectiveFrom === today && !r.effectiveTo)).toBe(true);
    expect(fresh.find((r) => r.time === "08:00")).toMatchObject({ dosage: 100, daysOfWeek: [1, 2] });
    expect(fresh.find((r) => r.time === "12:00")).toMatchObject({ dosage: 25, daysOfWeek: [3] });

    // Every write is queued for sync as an upsert.
    for (const r of rows) {
      expect((await syncRowsFor("phaseSchedules", r.id))[0]!.op).toBe("upsert");
    }
  });

  it("soft-deletes and disables a removed row that never applied, so the tombstone can sync", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    // Added today: it has no days before today to keep.
    const drop = makePhaseSchedule(phase.id, { createdAt: Date.now() - 1000 });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(drop);

    await updatePhase({ id: phase.id, schedules: [] });

    const row = await db.phaseSchedules.get(drop.id);
    expect(row).toBeDefined();
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.enabled).toBe(false);
    expect(row!.updatedAt).toBeGreaterThan(drop.updatedAt);
    expect((await syncRowsFor("phaseSchedules", drop.id))[0]!.op).toBe("delete");
  });

  it("edits a pending phase's rows in place", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id, { status: "pending" });
    const row = makePhaseSchedule(phase.id, { time: "08:00", dosage: 50 });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(row);

    await updatePhase({
      id: phase.id,
      schedules: [{ id: row.id, time: "08:00", daysOfWeek: [1], dosage: 75 }],
    });

    const rows = await db.phaseSchedules.where("phaseId").equals(phase.id).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: row.id, dosage: 75 });
    expect(rows[0]!.effectiveTo).toBeUndefined();
  });

  it("refuses an \"Apply from\" date before today", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const row = makePhaseSchedule(phase.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(row);

    const result = await updatePhase({
      id: phase.id,
      applyFrom: "2020-01-01",
      schedules: [{ id: row.id, time: "09:00", daysOfWeek: [1], dosage: 50 }],
    });
    expect(result).toMatchObject({ success: false, error: "Pick today or a later date." });
    expect(await db.phaseSchedules.where("phaseId").equals(phase.id).toArray()).toEqual([row]);
  });

  it("ignores already-deleted schedules when reconciling", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const ghost = makePhaseSchedule(phase.id, { deletedAt: 1700000000001, enabled: false });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(ghost);

    await updatePhase({ id: phase.id, schedules: [] });

    // Untouched: no re-tombstone, no new sync op.
    expect((await db.phaseSchedules.get(ghost.id))!.updatedAt).toBe(ghost.updatedAt);
    expect(await syncRowsFor("phaseSchedules", ghost.id)).toHaveLength(0);
  });

  it("writes a prescription_updated audit recording updated fields + schedulesModified", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);

    await updatePhase({ id: phase.id, notes: "new notes", schedules: [] });

    const audits = await auditsByAction("prescription_updated");
    expect(audits).toHaveLength(1);
    const details = parseDetails(audits[0]!.details);
    expect(details.action).toBe("phase_updated");
    expect(details.updatedFields).toEqual(["notes"]);
    expect(details.schedulesModified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reads — soft-deleted phases are invisible
// ---------------------------------------------------------------------------

describe("phase reads", () => {
  it("getActivePhaseForPrescription skips a tombstoned phase whose status is stale", async () => {
    const rx = makePrescription();
    const ghost = makeMedicationPhase(rx.id, { status: "active", deletedAt: 1700000000001 });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(ghost);

    expect(await getActivePhaseForPrescription(rx.id)).toBeUndefined();
  });

  it("getActivePhaseForPrescription prefers a running titration over maintenance", async () => {
    const rx = makePrescription();
    const maint = makeMedicationPhase(rx.id, { status: "active", type: "maintenance" });
    const tit = makeMedicationPhase(rx.id, {
      status: "active",
      type: "titration",
      titrationPlanId: "plan-1",
    });
    await db.prescriptions.add(rx);
    await db.medicationPhases.bulkAdd([maint, tit]);

    expect((await getActivePhaseForPrescription(rx.id))!.id).toBe(tit.id);
  });

  it("getPhasesForPrescription omits soft-deleted phases", async () => {
    const rx = makePrescription();
    const live = makeMedicationPhase(rx.id);
    const ghost = makeMedicationPhase(rx.id, { deletedAt: 1700000000001 });
    await db.prescriptions.add(rx);
    await db.medicationPhases.bulkAdd([live, ghost]);

    expect((await getPhasesForPrescription(rx.id)).map((p) => p.id)).toEqual([live.id]);
  });
});

// ---------------------------------------------------------------------------
// deletePhase — tombstone also retires the lifecycle flags
// ---------------------------------------------------------------------------

describe("deletePhase", () => {
  it("cancels the phase and disables its schedules", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id, { status: "active" });
    const sched = makePhaseSchedule(phase.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(sched);

    await deletePhase(phase.id);

    const p = await db.medicationPhases.get(phase.id);
    expect(p!.deletedAt).not.toBeNull();
    expect(p!.status).toBe("cancelled");
    const s = await db.phaseSchedules.get(sched.id);
    expect(s!.deletedAt).not.toBeNull();
    expect(s!.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updatePhase — editing abroad keeps the schedule's anchor
// (gap-timezone-travel-recalc#2). The test device zone is UTC.
// ---------------------------------------------------------------------------

describe("updatePhase keeps each schedule's anchorTimezone", () => {
  async function seedBerlinSchedule() {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id, {
      time: "08:00",
      anchorTimezone: "Europe/Berlin",
      scheduleTimeUTC: 999, // sentinel: must survive an edit that keeps the time
    });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    return { phase, schedule };
  }

  it("does not re-anchor or re-encode a schedule whose time is unchanged", async () => {
    const { phase, schedule } = await seedBerlinSchedule();

    await updatePhase({
      id: phase.id,
      notes: "take with food",
      schedules: [{ id: schedule.id, time: "08:00", daysOfWeek: [1], dosage: 75 }],
    });

    // The new row (from today) continues the old one's anchor and cache.
    const updated = await openRow(phase.id);
    expect(updated.anchorTimezone).toBe("Europe/Berlin");
    expect(updated.scheduleTimeUTC).toBe(999);
    expect(updated.dosage).toBe(75);
  });

  it("encodes a changed time in the schedule's own anchor, not the device zone", async () => {
    const { phase, schedule } = await seedBerlinSchedule();

    await updatePhase({
      id: phase.id,
      schedules: [{ id: schedule.id, time: "09:00", daysOfWeek: [1], dosage: 50 }],
    });

    const updated = await openRow(phase.id);
    expect(updated.time).toBe("09:00");
    expect(updated.anchorTimezone).toBe("Europe/Berlin");
    expect(updated.scheduleTimeUTC).toBe(localHHMMStringToUTCMinutes("09:00", "Europe/Berlin"));
    // The old row keeps its time for the days before today.
    expect((await db.phaseSchedules.get(schedule.id))!.time).toBe("08:00");
  });
});
