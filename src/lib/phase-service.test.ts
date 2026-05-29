import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  activatePhase,
  startNewPhase,
  updatePhase,
  getActivePhaseForPrescription,
  type CreatePhaseInput,
} from "@/lib/phase-service";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";

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
  it("partitions existing/new/removed schedules into update/add/delete", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const keep = makePhaseSchedule(phase.id, { time: "08:00", dosage: 50 });
    const drop = makePhaseSchedule(phase.id, { time: "20:00", dosage: 50 });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.bulkAdd([keep, drop]);

    const result = await updatePhase({
      id: phase.id,
      schedules: [
        // existing → updated (dosage change)
        { id: keep.id, time: "08:00", daysOfWeek: [1, 2], dosage: 100 },
        // no id → added
        { time: "12:00", daysOfWeek: [3], dosage: 25 },
        // `drop` omitted → deleted
      ],
    });
    expect(result.success).toBe(true);

    const remaining = await db.phaseSchedules.where("phaseId").equals(phase.id).toArray();
    const remainingIds = remaining.map((s) => s.id);

    // kept+updated survives with new values; dropped is gone; new one added.
    expect(remainingIds).toContain(keep.id);
    expect(remainingIds).not.toContain(drop.id);
    expect(remaining).toHaveLength(2);

    const updated = remaining.find((s) => s.id === keep.id)!;
    expect(updated.dosage).toBe(100);
    expect(updated.daysOfWeek).toEqual([1, 2]);

    const added = remaining.find((s) => s.id !== keep.id)!;
    expect(added.time).toBe("12:00");
    expect(added.dosage).toBe(25);

    // Sync ops: delete for the removed one, upserts for kept+added.
    const dropSync = await syncRowsFor("phaseSchedules", drop.id);
    expect(dropSync).toHaveLength(1);
    expect(dropSync[0]!.op).toBe("delete");
    const keepSync = await syncRowsFor("phaseSchedules", keep.id);
    expect(keepSync[0]!.op).toBe("upsert");
    const addSync = await syncRowsFor("phaseSchedules", added.id);
    expect(addSync[0]!.op).toBe("upsert");
  });

  it("hard-deletes removed schedules (row is gone, not soft-deleted)", async () => {
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    const drop = makePhaseSchedule(phase.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(drop);

    await updatePhase({ id: phase.id, schedules: [] });

    expect(await db.phaseSchedules.get(drop.id)).toBeUndefined();
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
