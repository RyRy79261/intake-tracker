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
import {
  makePrescription,
  makeMedicationPhase,
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
