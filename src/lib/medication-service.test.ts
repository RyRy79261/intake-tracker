import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  getPrescriptions,
  getPrescriptionById,
  getActivePrescriptions,
  getInactivePrescriptions,
  addPrescription,
  updatePrescription,
  deletePrescription,
  getActivePhaseForPrescription,
  getPhasesForPrescription,
  activatePhase,
  startNewPhase,
  deletePhase,
  getInventoryForPrescription,
  getActiveInventoryForPrescription,
  addInventoryItem,
  adjustStock,
  addMedicationToPrescription,
  type CreatePrescriptionInput,
} from "@/lib/medication-service";
import {
  makePrescription,
  makeMedicationPhase,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";

// ---------------------------------------------------------------------------
// Helper: minimal valid CreatePrescriptionInput
// ---------------------------------------------------------------------------
function validPrescriptionInput(
  overrides?: Partial<CreatePrescriptionInput>,
): CreatePrescriptionInput {
  return {
    genericName: "Metoprolol",
    indication: "Hypertension",
    unit: "mg",
    foodInstruction: "before",
    brandName: "Lopressor",
    currentStock: 30,
    strength: 50,
    pillShape: "round",
    pillColor: "#FFFFFF",
    schedules: [
      { time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 50 },
    ],
    ...overrides,
  };
}

// ===================================================================
// Prescription CRUD
// ===================================================================

describe("prescription CRUD", () => {
  it("addPrescription persists prescription with required fields and isActive=true", async () => {
    const result = await addPrescription(validPrescriptionInput());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const { prescription } = result.data;
    expect(prescription.genericName).toBe("Metoprolol");
    expect(prescription.indication).toBe("Hypertension");
    expect(prescription.isActive).toBe(true);
    expect(prescription.deletedAt).toBeNull();

    // Verify persisted in DB
    const stored = await db.prescriptions.get(prescription.id);
    expect(stored).toBeDefined();
    expect(stored!.genericName).toBe("Metoprolol");
  });

  it("addPrescription stores optional notes, contraindications, and warnings", async () => {
    const result = await addPrescription(
      validPrescriptionInput({
        notes: "Take with water",
        contraindications: ["Asthma"],
        warnings: ["May cause dizziness"],
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    const stored = await db.prescriptions.get(result.data.prescription.id);
    expect(stored!.notes).toBe("Take with water");
    expect(stored!.contraindications).toEqual(["Asthma"]);
    expect(stored!.warnings).toEqual(["May cause dizziness"]);
  });

  it("addPrescription creates initial phase, inventory, and schedules", async () => {
    const result = await addPrescription(validPrescriptionInput());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const { prescription, phase, inventory, schedules } = result.data;

    // Phase created
    expect(phase).not.toBeNull();
    expect(phase!.prescriptionId).toBe(prescription.id);
    expect(phase!.status).toBe("active");
    expect(phase!.type).toBe("maintenance");

    // Inventory created
    expect(inventory.prescriptionId).toBe(prescription.id);
    expect(inventory.brandName).toBe("Lopressor");
    expect(inventory.isActive).toBe(true);

    // Schedules created
    expect(schedules.length).toBe(1);
    expect(schedules[0]!.dosage).toBe(50);
  });

  it("addPrescription with empty schedules creates no phase (PRN/as-needed)", async () => {
    const result = await addPrescription(
      validPrescriptionInput({ schedules: [] }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.phase).toBeNull();
    expect(result.data.schedules).toHaveLength(0);

    // Inventory still created
    expect(result.data.inventory).toBeDefined();
  });

  it("getPrescriptions returns all prescriptions", async () => {
    await addPrescription(validPrescriptionInput({ genericName: "Drug A" }));
    await addPrescription(validPrescriptionInput({ genericName: "Drug B" }));

    const all = await getPrescriptions();
    expect(all.length).toBe(2);
  });

  it("getActivePrescriptions returns only isActive=true", async () => {
    const r1 = await addPrescription(validPrescriptionInput({ genericName: "Active" }));
    const r2 = await addPrescription(validPrescriptionInput({ genericName: "Inactive" }));
    expect(r1.success && r2.success).toBe(true);
    if (!r1.success || !r2.success) return;

    // Deactivate second prescription
    await updatePrescription(r2.data.prescription.id, { isActive: false });

    const active = await getActivePrescriptions();
    expect(active.length).toBe(1);
    expect(active[0]!.genericName).toBe("Active");
  });

  it("getInactivePrescriptions returns only isActive=false", async () => {
    const r1 = await addPrescription(validPrescriptionInput({ genericName: "Active" }));
    const r2 = await addPrescription(validPrescriptionInput({ genericName: "Inactive" }));
    expect(r1.success && r2.success).toBe(true);
    if (!r1.success || !r2.success) return;

    await updatePrescription(r2.data.prescription.id, { isActive: false });

    const inactive = await getInactivePrescriptions();
    expect(inactive.length).toBe(1);
    expect(inactive[0]!.genericName).toBe("Inactive");
  });

  it("getPrescriptionById returns correct prescription or undefined", async () => {
    const result = await addPrescription(validPrescriptionInput());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const found = await getPrescriptionById(result.data.prescription.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(result.data.prescription.id);

    const notFound = await getPrescriptionById("nonexistent-id");
    expect(notFound).toBeUndefined();
  });

  it("updatePrescription updates specified fields and bumps updatedAt", async () => {
    const result = await addPrescription(validPrescriptionInput());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const originalUpdatedAt = result.data.prescription.updatedAt;

    // Small delay to ensure updatedAt differs
    await new Promise((r) => setTimeout(r, 10));
    await updatePrescription(result.data.prescription.id, {
      notes: "Updated notes",
    });

    const updated = await db.prescriptions.get(result.data.prescription.id);
    expect(updated!.notes).toBe("Updated notes");
    expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt);
    // Original fields preserved
    expect(updated!.genericName).toBe("Metoprolol");
  });

  it("deletePrescription removes prescription and cascades to phases", async () => {
    const result = await addPrescription(validPrescriptionInput());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const prescriptionId = result.data.prescription.id;

    // Confirm records exist before delete
    const phasesBefore = await db.medicationPhases
      .where("prescriptionId")
      .equals(prescriptionId)
      .toArray();
    expect(phasesBefore.length).toBeGreaterThan(0);

    const deleteResult = await deletePrescription(prescriptionId);
    expect(deleteResult.success).toBe(true);

    // Prescription soft-deleted
    const afterRx = await db.prescriptions.get(prescriptionId);
    expect(afterRx).toBeDefined();
    expect(afterRx!.deletedAt).toBeGreaterThan(0);

    // Child phases soft-deleted
    const phasesAfter = await db.medicationPhases
      .where("prescriptionId")
      .equals(prescriptionId)
      .toArray();
    expect(phasesAfter.every((p) => p.deletedAt != null && p.deletedAt > 0)).toBe(true);

    // Inventory soft-deleted
    const invAfter = await db.inventoryItems
      .where("prescriptionId")
      .equals(prescriptionId)
      .toArray();
    expect(invAfter.every((i) => i.deletedAt != null && i.deletedAt > 0)).toBe(true);
  });
});

// ===================================================================
// Phase lifecycle
// ===================================================================

describe("phase lifecycle", () => {
  it("startNewPhase creates phase with correct prescriptionId and status", async () => {
    const rxResult = await addPrescription(validPrescriptionInput());
    expect(rxResult.success).toBe(true);
    if (!rxResult.success) return;

    const rxId = rxResult.data.prescription.id;

    const phaseResult = await startNewPhase({
      prescriptionId: rxId,
      type: "maintenance",
      unit: "mg",
      startDate: Date.now(),
      foodInstruction: "after",
      schedules: [{ time: "20:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 100 }],
    });
    expect(phaseResult.success).toBe(true);
    if (!phaseResult.success) return;

    expect(phaseResult.data.prescriptionId).toBe(rxId);
    expect(phaseResult.data.status).toBe("active");
    expect(phaseResult.data.type).toBe("maintenance");
  });

  it("activatePhase sets target to active and completes the previously active phase", async () => {
    // Seed: prescription with Phase A (active) and Phase B (pending)
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    const phaseA = makeMedicationPhase(rx.id, { status: "active" });
    const phaseB = makeMedicationPhase(rx.id, { status: "pending" });
    await db.medicationPhases.bulkAdd([phaseA, phaseB]);

    // Activate Phase B
    const result = await activatePhase(phaseB.id);
    expect(result.success).toBe(true);

    // Phase B is now active
    const bAfter = await db.medicationPhases.get(phaseB.id);
    expect(bAfter!.status).toBe("active");

    // Phase A is now completed with endDate set
    const aAfter = await db.medicationPhases.get(phaseA.id);
    expect(aAfter!.status).toBe("completed");
    expect(aAfter!.endDate).toBeDefined();
    expect(typeof aAfter!.endDate).toBe("number");
  });

  it("activatePhase with no previously active phase just activates the target", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    const phase = makeMedicationPhase(rx.id, { status: "pending" });
    await db.medicationPhases.add(phase);

    const result = await activatePhase(phase.id);
    expect(result.success).toBe(true);

    const after = await db.medicationPhases.get(phase.id);
    expect(after!.status).toBe("active");
  });

  it("startNewPhase deactivates current active phase when starting an immediate phase", async () => {
    const rxResult = await addPrescription(validPrescriptionInput());
    expect(rxResult.success).toBe(true);
    if (!rxResult.success) return;

    const rxId = rxResult.data.prescription.id;
    const originalPhaseId = rxResult.data.phase!.id;

    // Start a new immediate phase (startDate in the past/now)
    const newPhaseResult = await startNewPhase({
      prescriptionId: rxId,
      type: "maintenance",
      unit: "mg",
      startDate: Date.now(),
      foodInstruction: "none",
      schedules: [{ time: "12:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 75 }],
    });
    expect(newPhaseResult.success).toBe(true);
    if (!newPhaseResult.success) return;

    // New phase is active
    expect(newPhaseResult.data.status).toBe("active");

    // Original phase is completed
    const original = await db.medicationPhases.get(originalPhaseId);
    expect(original!.status).toBe("completed");
  });

  it("getActivePhaseForPrescription returns the active phase", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    const activePhase = makeMedicationPhase(rx.id, { status: "active" });
    const completedPhase = makeMedicationPhase(rx.id, { status: "completed" });
    await db.medicationPhases.bulkAdd([activePhase, completedPhase]);

    const result = await getActivePhaseForPrescription(rx.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(activePhase.id);
    expect(result!.status).toBe("active");
  });

  it("getPhasesForPrescription returns all phases for a prescription", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    await db.medicationPhases.bulkAdd([
      makeMedicationPhase(rx.id, { status: "active" }),
      makeMedicationPhase(rx.id, { status: "completed" }),
    ]);

    const phases = await getPhasesForPrescription(rx.id);
    expect(phases.length).toBe(2);
    expect(phases.every((p) => p.prescriptionId === rx.id)).toBe(true);
  });

  it("deletePhase removes the phase and its schedules", async () => {
    const rxResult = await addPrescription(validPrescriptionInput());
    expect(rxResult.success).toBe(true);
    if (!rxResult.success) return;

    const phaseId = rxResult.data.phase!.id;

    // Confirm schedules exist
    const schedulesBefore = await db.phaseSchedules
      .where("phaseId")
      .equals(phaseId)
      .toArray();
    expect(schedulesBefore.length).toBeGreaterThan(0);

    const result = await deletePhase(phaseId);
    expect(result.success).toBe(true);

    // Phase soft-deleted
    const phaseAfter = await db.medicationPhases.get(phaseId);
    expect(phaseAfter).toBeDefined();
    expect(phaseAfter!.deletedAt).toBeGreaterThan(0);

    // Schedules soft-deleted
    const schedulesAfter = await db.phaseSchedules
      .where("phaseId")
      .equals(phaseId)
      .toArray();
    expect(schedulesAfter.every((s) => s.deletedAt != null && s.deletedAt > 0)).toBe(true);
  });
});

// ===================================================================
// Inventory management
// ===================================================================

describe("inventory management", () => {
  it("addPrescription creates initial inventory with stock transaction", async () => {
    const result = await addPrescription(
      validPrescriptionInput({ currentStock: 60 }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    const inv = result.data.inventory;
    expect(inv.currentStock).toBe(60);

    // Verify initial transaction was created
    const txs = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inv.id)
      .toArray();
    expect(txs.length).toBe(1);
    expect(txs[0]!.type).toBe("refill");
    expect(txs[0]!.amount).toBe(60);
  });

  it("getInventoryForPrescription returns all items", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    const inv1 = makeInventoryItem(rx.id, { isActive: true });
    const inv2 = makeInventoryItem(rx.id, { isActive: false, isArchived: true });
    await db.inventoryItems.bulkAdd([inv1, inv2]);

    const items = await getInventoryForPrescription(rx.id);
    expect(items.length).toBe(2);
  });

  it("getActiveInventoryForPrescription returns only the active item", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    const active = makeInventoryItem(rx.id, { isActive: true });
    const archived = makeInventoryItem(rx.id, { isActive: false, isArchived: true });
    await db.inventoryItems.bulkAdd([active, archived]);

    const result = await getActiveInventoryForPrescription(rx.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(active.id);
    expect(result!.isActive).toBe(true);
  });

  it("adjustStock changes currentStock and creates transaction", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    const inv = makeInventoryItem(rx.id, { currentStock: 30 });
    await db.inventoryItems.add(inv);

    const result = await adjustStock(inv.id, -2, "Took 2 pills");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toBe(28);

    // Verify DB state
    const updated = await db.inventoryItems.get(inv.id);
    expect(updated!.currentStock).toBe(28);

    // Transaction recorded
    const txs = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(inv.id)
      .toArray();
    expect(txs.length).toBe(1);
    expect(txs[0]!.amount).toBe(-2);
  });

  it("addMedicationToPrescription archives existing inventory and deactivates active phase", async () => {
    // Create initial prescription
    const rxResult = await addPrescription(validPrescriptionInput());
    expect(rxResult.success).toBe(true);
    if (!rxResult.success) return;

    const rxId = rxResult.data.prescription.id;
    const originalPhaseId = rxResult.data.phase!.id;
    const originalInvId = rxResult.data.inventory.id;

    // Add new medication to same prescription
    const addResult = await addMedicationToPrescription({
      prescriptionId: rxId,
      unit: "mg",
      foodInstruction: "after",
      brandName: "Generic Metoprolol",
      currentStock: 90,
      strength: 100,
      pillShape: "oval",
      pillColor: "#FF0000",
      schedules: [{ time: "09:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 100 }],
    });
    expect(addResult.success).toBe(true);

    // Original inventory archived
    const originalInv = await db.inventoryItems.get(originalInvId);
    expect(originalInv!.isActive).toBe(false);
    expect(originalInv!.isArchived).toBe(true);

    // Original phase completed
    const originalPhase = await db.medicationPhases.get(originalPhaseId);
    expect(originalPhase!.status).toBe("completed");

    // New inventory is active
    const allInv = await db.inventoryItems
      .where("prescriptionId")
      .equals(rxId)
      .toArray();
    const activeInv = allInv.find((i) => i.isActive);
    expect(activeInv).toBeDefined();
    expect(activeInv!.brandName).toBe("Generic Metoprolol");
  });
});
