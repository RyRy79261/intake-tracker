import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  createTitrationPlan,
  getTitrationPlans,
  getTitrationPlanById,
  getActiveTitrationPlans,
  getPhasesForTitrationPlan,
  getConditionLabels,
  getActiveTitrationPhaseForPrescription,
  activateTitrationPlan,
  completeTitrationPlan,
  cancelTitrationPlan,
  updateTitrationPlan,
  deleteTitrationPlan,
  type CreateTitrationPlanInput,
} from "@/lib/titration-service";
import { getDailyDoseSchedule } from "@/lib/dose-schedule-service";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";

// ---------------------------------------------------------------------------
// Helper: seed a prescription and return its id
// ---------------------------------------------------------------------------
async function seedPrescription(
  overrides?: Partial<Parameters<typeof makePrescription>[0]>,
): Promise<string> {
  const rx = makePrescription(overrides);
  await db.prescriptions.add(rx);
  return rx.id;
}

function validPlanInput(
  prescriptionId: string,
  overrides?: Partial<CreateTitrationPlanInput>,
): CreateTitrationPlanInput {
  return {
    title: "Metoprolol Uptitration",
    conditionLabel: "Heart failure",
    entries: [
      {
        prescriptionId,
        unit: "mg",
        schedules: [
          { time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 25 },
        ],
      },
      {
        prescriptionId,
        unit: "mg",
        schedules: [
          { time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 50 },
        ],
      },
    ],
    ...overrides,
  };
}

// ===================================================================
// createTitrationPlan
// ===================================================================

describe("createTitrationPlan", () => {
  it("creates plan with 2 entries producing 2 phases + 2 schedules, status=draft", async () => {
    const rxId = await seedPrescription();
    const result = await createTitrationPlan(validPlanInput(rxId));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const plan = result.data;
    expect(plan.title).toBe("Metoprolol Uptitration");
    expect(plan.conditionLabel).toBe("Heart failure");
    expect(plan.status).toBe("draft");

    // 2 phases created with type "titration" and titrationPlanId linked
    const phases = await db.medicationPhases.toArray();
    const planPhases = phases.filter((p) => p.titrationPlanId === plan.id);
    expect(planPhases.length).toBe(2);
    expect(planPhases.every((p) => p.type === "titration")).toBe(true);
    expect(planPhases.every((p) => p.prescriptionId === rxId)).toBe(true);
    expect(planPhases.every((p) => p.status === "pending")).toBe(true);

    // 2 schedules created (one per entry)
    const schedules = await db.phaseSchedules.toArray();
    expect(schedules.length).toBe(2);
    const dosages = schedules.map((s) => s.dosage).sort((a, b) => a - b);
    expect(dosages).toEqual([25, 50]);
  });

  it("startImmediately creates plan with status=active and phases active", async () => {
    const rxId = await seedPrescription();
    const result = await createTitrationPlan(
      validPlanInput(rxId, { startImmediately: true }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.status).toBe("active");

    const phases = await db.medicationPhases.toArray();
    const planPhases = phases.filter(
      (p) => p.titrationPlanId === result.data.id,
    );
    expect(planPhases.every((p) => p.status === "active")).toBe(true);
  });

  it("stores optional notes and warnings on the plan", async () => {
    const rxId = await seedPrescription();
    const result = await createTitrationPlan(
      validPlanInput(rxId, {
        notes: "Monitor BP weekly",
        warnings: ["Watch for bradycardia"],
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    const stored = await db.titrationPlans.get(result.data.id);
    expect(stored!.notes).toBe("Monitor BP weekly");
    expect(stored!.warnings).toEqual(["Watch for bradycardia"]);
  });
});

// ===================================================================
// Read functions
// ===================================================================

describe("titration plan reads", () => {
  it("getTitrationPlans returns all plans", async () => {
    const rxId = await seedPrescription();
    await createTitrationPlan(validPlanInput(rxId, { title: "Plan A" }));
    await createTitrationPlan(validPlanInput(rxId, { title: "Plan B" }));

    const plans = await getTitrationPlans();
    expect(plans.length).toBe(2);
  });

  it("getTitrationPlanById returns correct plan or undefined", async () => {
    const rxId = await seedPrescription();
    const result = await createTitrationPlan(validPlanInput(rxId));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const found = await getTitrationPlanById(result.data.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(result.data.id);

    const notFound = await getTitrationPlanById("nonexistent");
    expect(notFound).toBeUndefined();
  });

  it("getActiveTitrationPlans returns only active plans", async () => {
    const rxId = await seedPrescription();
    await createTitrationPlan(validPlanInput(rxId)); // draft
    await createTitrationPlan(
      validPlanInput(rxId, { startImmediately: true }),
    ); // active

    const active = await getActiveTitrationPlans();
    expect(active.length).toBe(1);
    expect(active[0]!.status).toBe("active");
  });

  it("getPhasesForTitrationPlan returns phases linked to the plan", async () => {
    const rxId = await seedPrescription();
    const result = await createTitrationPlan(validPlanInput(rxId));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const phases = await getPhasesForTitrationPlan(result.data.id);
    expect(phases.length).toBe(2);
    expect(phases.every((p) => p.titrationPlanId === result.data.id)).toBe(
      true,
    );
  });

  it("getConditionLabels returns unique labels from plans and prescriptions", async () => {
    const rxId = await seedPrescription({ indication: "Hypertension" });
    await createTitrationPlan(
      validPlanInput(rxId, { conditionLabel: "Heart failure" }),
    );
    await createTitrationPlan(
      validPlanInput(rxId, { conditionLabel: "Heart failure" }),
    ); // duplicate

    const labels = await getConditionLabels();
    expect(labels).toContain("Heart failure");
    expect(labels).toContain("Hypertension");
    // No duplicates
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it("getActiveTitrationPhaseForPrescription returns active titration phase", async () => {
    const rxId = await seedPrescription();
    const result = await createTitrationPlan(
      validPlanInput(rxId, { startImmediately: true }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    const phase = await getActiveTitrationPhaseForPrescription(rxId);
    expect(phase).toBeDefined();
    expect(phase!.type).toBe("titration");
    expect(phase!.status).toBe("active");
    expect(phase!.prescriptionId).toBe(rxId);
  });
});

// ===================================================================
// activateTitrationPlan
// ===================================================================

describe("activateTitrationPlan", () => {
  it("sets plan status to active and activates pending phases", async () => {
    const rxId = await seedPrescription();
    const planResult = await createTitrationPlan(validPlanInput(rxId));
    expect(planResult.success).toBe(true);
    if (!planResult.success) return;

    const planId = planResult.data.id;
    expect(planResult.data.status).toBe("draft");

    const activateResult = await activateTitrationPlan(planId);
    expect(activateResult.success).toBe(true);

    // Plan is active
    const plan = await db.titrationPlans.get(planId);
    expect(plan!.status).toBe("active");

    // All pending phases are now active
    const phases = await db.medicationPhases.toArray();
    const planPhases = phases.filter((p) => p.titrationPlanId === planId);
    expect(planPhases.every((p) => p.status === "active")).toBe(true);
  });
});

// ===================================================================
// completeTitrationPlan
// ===================================================================

describe("completeTitrationPlan", () => {
  it("sets plan status to completed and completes all titration phases", async () => {
    const rxId = await seedPrescription();

    // Create a maintenance phase for the prescription (so completion can promote)
    const maintenancePhase = makeMedicationPhase(rxId, {
      type: "maintenance",
      status: "active",
    });
    await db.medicationPhases.add(maintenancePhase);

    // Create and activate a titration plan
    const planResult = await createTitrationPlan(
      validPlanInput(rxId, { startImmediately: true }),
    );
    expect(planResult.success).toBe(true);
    if (!planResult.success) return;

    const planId = planResult.data.id;

    // Complete the plan
    const completeResult = await completeTitrationPlan(planId);
    expect(completeResult.success).toBe(true);

    // Plan is completed
    const plan = await db.titrationPlans.get(planId);
    expect(plan!.status).toBe("completed");

    // All titration phases are completed
    const allPhases = await db.medicationPhases.toArray();
    const titrationPhases = allPhases.filter(
      (p) => p.titrationPlanId === planId,
    );
    expect(titrationPhases.every((p) => p.status === "completed")).toBe(true);
    expect(titrationPhases.every((p) => p.endDate !== undefined)).toBe(true);
  });
});

// ===================================================================
// cancelTitrationPlan
// ===================================================================

describe("cancelTitrationPlan", () => {
  it("sets plan status to cancelled and cancels active/pending phases", async () => {
    const rxId = await seedPrescription();

    // Add a maintenance phase that will be re-activated on cancel
    const maintenancePhase = makeMedicationPhase(rxId, {
      type: "maintenance",
      status: "completed",
    });
    await db.medicationPhases.add(maintenancePhase);

    // Create and activate a titration plan
    const planResult = await createTitrationPlan(
      validPlanInput(rxId, { startImmediately: true }),
    );
    expect(planResult.success).toBe(true);
    if (!planResult.success) return;

    const planId = planResult.data.id;

    // Cancel the plan
    const cancelResult = await cancelTitrationPlan(planId);
    expect(cancelResult.success).toBe(true);

    // Plan is cancelled
    const plan = await db.titrationPlans.get(planId);
    expect(plan!.status).toBe("cancelled");

    // All titration phases are cancelled
    const allPhases = await db.medicationPhases.toArray();
    const titrationPhases = allPhases.filter(
      (p) => p.titrationPlanId === planId,
    );
    expect(titrationPhases.every((p) => p.status === "cancelled")).toBe(true);

    // Maintenance phase re-activated
    const maintenance = await db.medicationPhases.get(maintenancePhase.id);
    expect(maintenance!.status).toBe("active");
  });
});

// ===================================================================
// updateTitrationPlan
// ===================================================================

describe("updateTitrationPlan", () => {
  it("updates title, notes, and warnings", async () => {
    const rxId = await seedPrescription();
    const planResult = await createTitrationPlan(validPlanInput(rxId));
    expect(planResult.success).toBe(true);
    if (!planResult.success) return;

    const updateResult = await updateTitrationPlan({
      planId: planResult.data.id,
      title: "Updated Title",
      notes: "New notes",
      warnings: ["New warning"],
    });
    expect(updateResult.success).toBe(true);
    if (!updateResult.success) return;

    expect(updateResult.data.title).toBe("Updated Title");

    const stored = await db.titrationPlans.get(planResult.data.id);
    expect(stored!.notes).toBe("New notes");
    expect(stored!.warnings).toEqual(["New warning"]);
  });

  it("replaces entries when provided, creating new phases and schedules", async () => {
    const rxId = await seedPrescription();
    const planResult = await createTitrationPlan(validPlanInput(rxId));
    expect(planResult.success).toBe(true);
    if (!planResult.success) return;

    const planId = planResult.data.id;

    // Original: 2 entries => 2 phases
    const phasesBefore = await getPhasesForTitrationPlan(planId);
    expect(phasesBefore.length).toBe(2);

    // Update with 1 entry
    await updateTitrationPlan({
      planId,
      entries: [
        {
          prescriptionId: rxId,
          unit: "mg",
          schedules: [
            { time: "20:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 200 },
          ],
        },
      ],
    });

    const phasesAfter = await getPhasesForTitrationPlan(planId);
    expect(phasesAfter.length).toBe(1);

    // New schedule has updated dosage
    const schedules = await db.phaseSchedules
      .where("phaseId")
      .equals(phasesAfter[0]!.id)
      .toArray();
    expect(schedules[0]!.dosage).toBe(200);
  });
});

// ===================================================================
// deleteTitrationPlan
// ===================================================================

describe("deleteTitrationPlan", () => {
  it("removes plan, phases, and schedules from DB", async () => {
    const rxId = await seedPrescription();
    const planResult = await createTitrationPlan(validPlanInput(rxId));
    expect(planResult.success).toBe(true);
    if (!planResult.success) return;

    const planId = planResult.data.id;

    const deleteResult = await deleteTitrationPlan(planId);
    expect(deleteResult.success).toBe(true);

    // Plan soft-deleted
    const plan = await db.titrationPlans.get(planId);
    expect(plan).toBeDefined();
    expect(plan!.deletedAt).toBeGreaterThan(0);

    // Phases soft-deleted
    const phases = await db.medicationPhases.toArray();
    const planPhases = phases.filter((p) => p.titrationPlanId === planId);
    expect(planPhases.every((p) => p.deletedAt != null && p.deletedAt > 0)).toBe(true);

    // Schedules soft-deleted
    const schedules = await db.phaseSchedules.toArray();
    expect(schedules.every((s) => s.deletedAt != null && s.deletedAt > 0)).toBe(true);
  });
});

// ===================================================================
// Lifecycle regressions — soft-deleted rows must never drive dosing
// ===================================================================

// 2023-11-14 (BASE_TS in fixtures) — every fixture prescription exists by then.
const TUESDAY = "2023-11-14";

async function seedMaintenance(opts?: {
  unit?: string;
  dosage?: number;
  foodInstruction?: "before" | "after" | "none";
}) {
  const rx = makePrescription();
  const maintenance = makeMedicationPhase(rx.id, {
    type: "maintenance",
    status: "active",
    unit: opts?.unit ?? "mg",
    foodInstruction: opts?.foodInstruction ?? "none",
  });
  const schedule = makePhaseSchedule(maintenance.id, {
    time: "08:00",
    scheduleTimeUTC: 480,
    dosage: opts?.dosage ?? 50,
  });
  await db.prescriptions.add(rx);
  await db.medicationPhases.add(maintenance);
  await db.phaseSchedules.add(schedule);
  return { rx, maintenance, schedule };
}

function singleEntryPlan(
  prescriptionId: string,
  dosage: number,
  overrides?: Partial<CreateTitrationPlanInput>,
  time = "08:00",
): CreateTitrationPlanInput {
  return {
    title: "Uptitration",
    conditionLabel: "HF",
    entries: [
      {
        prescriptionId,
        unit: "mg",
        schedules: [{ time, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage }],
      },
    ],
    ...overrides,
  };
}

async function slotsFor(rxId: string) {
  const slots = await getDailyDoseSchedule(TUESDAY, "UTC");
  return slots.filter((s) => s.prescriptionId === rxId);
}

describe("completeTitrationPlan — superseded maintenance schedules", () => {
  it("shows only the promoted dose afterwards (old maintenance schedule disabled)", async () => {
    const { rx, schedule: oldSched } = await seedMaintenance({ dosage: 50 });
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");

    const done = await completeTitrationPlan(plan.data.id);
    expect(done.success).toBe(true);

    const slots = await slotsFor(rx.id);
    expect(slots.map((s) => s.dosageMg)).toEqual([100]);
    expect(slots[0]!.phase.type).toBe("maintenance");

    const old = await db.phaseSchedules.get(oldSched.id);
    expect(old!.deletedAt).not.toBeNull();
    expect(old!.enabled).toBe(false);
  });

  it("does not copy schedules from an edited-away titration phase", async () => {
    const { rx } = await seedMaintenance({ dosage: 50 });
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");

    await updateTitrationPlan({
      planId: plan.data.id,
      entries: singleEntryPlan(rx.id, 150).entries,
    });
    await completeTitrationPlan(plan.data.id);

    const slots = await slotsFor(rx.id);
    expect(slots.map((s) => s.dosageMg)).toEqual([150]);
  });

  it("never copies a soft-deleted titration schedule into maintenance", async () => {
    const { rx, maintenance } = await seedMaintenance({ dosage: 50 });
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");
    const [titPhase] = await getPhasesForTitrationPlan(plan.data.id);
    // A tombstone left behind by an older client's edit.
    await db.phaseSchedules.add(
      makePhaseSchedule(titPhase!.id, { dosage: 999, deletedAt: 1700000000001 }),
    );

    await completeTitrationPlan(plan.data.id);

    const live = (await db.phaseSchedules.where("phaseId").equals(maintenance.id).toArray())
      .filter((s) => s.deletedAt == null);
    expect(live.map((s) => s.dosage)).toEqual([100]);
  });

  it("keeps the maintenance unit and food instruction instead of the titration defaults", async () => {
    const { rx, maintenance } = await seedMaintenance({ unit: "mcg", foodInstruction: "before" });
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 75, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");

    await completeTitrationPlan(plan.data.id);

    const after = await db.medicationPhases.get(maintenance.id);
    expect(after!.unit).toBe("mcg");
    expect(after!.foodInstruction).toBe("before");
  });
});

describe("updateTitrationPlan — edits in place", () => {
  it("keeps phase and schedule ids so a taken dose stays taken", async () => {
    const { rx } = await seedMaintenance({ dosage: 50 });
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");

    const [titPhase] = await getPhasesForTitrationPlan(plan.data.id);
    const [titSched] = await db.phaseSchedules.where("phaseId").equals(titPhase!.id).toArray();
    await db.doseLogs.add(
      makeDoseLog(rx.id, titPhase!.id, titSched!.id, { scheduledDate: TUESDAY, status: "taken" }),
    );

    // Notes-only edit: the drawer still resubmits the unchanged entries.
    const res = await updateTitrationPlan({
      planId: plan.data.id,
      notes: "typo fixed",
      entries: singleEntryPlan(rx.id, 100).entries,
    });
    expect(res.success).toBe(true);

    const phasesAfter = await getPhasesForTitrationPlan(plan.data.id);
    expect(phasesAfter.map((p) => p.id)).toEqual([titPhase!.id]);
    const schedAfter = await db.phaseSchedules.get(titSched!.id);
    expect(schedAfter!.deletedAt).toBeNull();
    // Unchanged schedule is left alone entirely.
    expect(schedAfter!.updatedAt).toBe(titSched!.updatedAt);

    const slots = await slotsFor(rx.id);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.status).toBe("taken");
  });

  it("updates a changed dose in place, keeping the schedule id", async () => {
    const { rx } = await seedMaintenance();
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");
    const [titPhase] = await getPhasesForTitrationPlan(plan.data.id);
    const [titSched] = await db.phaseSchedules.where("phaseId").equals(titPhase!.id).toArray();

    await updateTitrationPlan({
      planId: plan.data.id,
      entries: singleEntryPlan(rx.id, 125, {}, "09:30").entries,
    });

    const live = (await db.phaseSchedules.where("phaseId").equals(titPhase!.id).toArray())
      .filter((s) => s.deletedAt == null);
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe(titSched!.id);
    expect(live[0]!.dosage).toBe(125);
    expect(live[0]!.time).toBe("09:30");
  });

  it("cancels and disables a phase whose prescription was removed from the plan", async () => {
    const a = await seedMaintenance();
    const b = await seedMaintenance();
    const plan = await createTitrationPlan({
      ...singleEntryPlan(a.rx.id, 100, { startImmediately: true }),
      entries: [
        ...singleEntryPlan(a.rx.id, 100).entries,
        ...singleEntryPlan(b.rx.id, 20).entries,
      ],
    });
    if (!plan.success) throw new Error("setup");
    const bPhase = (await getPhasesForTitrationPlan(plan.data.id))
      .find((p) => p.prescriptionId === b.rx.id)!;

    await updateTitrationPlan({ planId: plan.data.id, entries: singleEntryPlan(a.rx.id, 100).entries });

    const removed = await db.medicationPhases.get(bPhase.id);
    expect(removed!.deletedAt).not.toBeNull();
    expect(removed!.status).toBe("cancelled");
    const removedScheds = await db.phaseSchedules.where("phaseId").equals(bPhase.id).toArray();
    expect(removedScheds.every((s) => s.enabled === false && s.deletedAt != null)).toBe(true);

    // b falls back to its maintenance dose
    expect((await slotsFor(b.rx.id)).map((s) => s.dosageMg)).toEqual([50]);
  });
});

describe("activateTitrationPlan — ignores deleted phases", () => {
  it("never re-activates a soft-deleted pending phase", async () => {
    const { rx } = await seedMaintenance();
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100));
    if (!plan.success) throw new Error("setup");
    const ghost = makeMedicationPhase(rx.id, {
      type: "titration",
      status: "pending",
      titrationPlanId: plan.data.id,
      deletedAt: 1700000000001,
    });
    await db.medicationPhases.add(ghost);

    await activateTitrationPlan(plan.data.id);

    expect((await db.medicationPhases.get(ghost.id))!.status).toBe("pending");
  });

  it("an edited draft activates with the edited dose", async () => {
    const { rx } = await seedMaintenance();
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, {}, "09:00"));
    if (!plan.success) throw new Error("setup");
    await updateTitrationPlan({
      planId: plan.data.id,
      entries: singleEntryPlan(rx.id, 150, {}, "10:00").entries,
    });

    await activateTitrationPlan(plan.data.id);

    const all = await db.medicationPhases.toArray();
    const activeTit = all.filter((p) => p.titrationPlanId === plan.data.id && p.status === "active");
    expect(activeTit).toHaveLength(1);
    expect(activeTit[0]!.deletedAt).toBeNull();
    expect((await slotsFor(rx.id)).map((s) => s.dosageMg)).toEqual([150]);
  });
});

describe("cancelTitrationPlan — maintenance re-activation", () => {
  it("does not re-activate an old completed maintenance phase when one is already active", async () => {
    const { rx, maintenance } = await seedMaintenance();
    const oldMaint = makeMedicationPhase(rx.id, { type: "maintenance", status: "completed" });
    await db.medicationPhases.add(oldMaint);
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");

    await cancelTitrationPlan(plan.data.id);

    expect((await db.medicationPhases.get(oldMaint.id))!.status).toBe("completed");
    expect((await db.medicationPhases.get(maintenance.id))!.status).toBe("active");
  });
});

describe("deleteTitrationPlan — retires lifecycle flags", () => {
  it("cancels the plan's phases and disables their schedules so they stop dosing", async () => {
    const { rx } = await seedMaintenance({ dosage: 50 });
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");

    await deleteTitrationPlan(plan.data.id);

    const phases = (await db.medicationPhases.toArray())
      .filter((p) => p.titrationPlanId === plan.data.id);
    expect(phases.every((p) => p.status === "cancelled")).toBe(true);
    const scheds = (await db.phaseSchedules.toArray()).filter((s) => phases.some((p) => p.id === s.phaseId));
    expect(scheds.every((s) => s.enabled === false)).toBe(true);
    expect((await db.titrationPlans.get(plan.data.id))!.status).toBe("cancelled");
    expect((await slotsFor(rx.id)).map((s) => s.dosageMg)).toEqual([50]);
  });

  it("puts a running plan's prescription back on its completed maintenance phase", async () => {
    const { rx, maintenance } = await seedMaintenance({ dosage: 50 });
    await db.medicationPhases.update(maintenance.id, { status: "completed" });
    const plan = await createTitrationPlan(singleEntryPlan(rx.id, 100, { startImmediately: true }));
    if (!plan.success) throw new Error("setup");

    await deleteTitrationPlan(plan.data.id);

    expect((await db.medicationPhases.get(maintenance.id))!.status).toBe("active");
    expect((await slotsFor(rx.id)).map((s) => s.dosageMg)).toEqual([50]);
  });
});

describe("titration units follow the prescription", () => {
  it("inherits the maintenance unit when the entry omits one", async () => {
    const { rx } = await seedMaintenance({ unit: "mcg" });
    const entries = singleEntryPlan(rx.id, 75).entries.map(({ unit: _unit, ...e }) => e);
    const plan = await createTitrationPlan({ ...singleEntryPlan(rx.id, 75), entries });
    if (!plan.success) throw new Error("setup");

    const [phase] = await getPhasesForTitrationPlan(plan.data.id);
    expect(phase!.unit).toBe("mcg");

    await updateTitrationPlan({ planId: plan.data.id, entries });
    expect((await db.medicationPhases.get(phase!.id))!.unit).toBe("mcg");
  });
});
