import { db, type Prescription, type MedicationPhase, type InventoryItem, type PhaseSchedule, type PillShape, type FoodInstruction } from "./db";

export interface CreatePrescriptionInput {
  // Prescription level
  genericName: string;
  indication: string;
  notes?: string;
  contraindications?: string[];
  warnings?: string[];
  
  // Phase level (initial maintenance phase)
  unit: string;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  
  // Inventory level
  brandName: string;
  currentStock: number;
  strength: number;
  pillShape: PillShape;
  pillColor: string;
  visualIdentification?: string;
  refillAlertDays?: number;
  refillAlertPills?: number;

  // Schedules
  schedules: { time: string; daysOfWeek: number[], dosage: number }[];
}

export async function addPrescription(input: CreatePrescriptionInput): Promise<{
  prescription: Prescription;
  phase: MedicationPhase;
  inventory: InventoryItem;
  schedules: PhaseSchedule[];
}> {
  const now = Date.now();
  
  const prescription: Prescription = {
    id: crypto.randomUUID(),
    genericName: input.genericName,
    indication: input.indication,
    notes: input.notes,
    contraindications: input.contraindications,
    warnings: input.warnings,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const phase: MedicationPhase = {
    id: crypto.randomUUID(),
    prescriptionId: prescription.id,
    type: "maintenance",
    unit: input.unit,
    startDate: now,
    foodInstruction: input.foodInstruction,
    foodNote: input.foodNote,
    status: "active",
    createdAt: now,
  };

  const inventory: InventoryItem = {
    id: crypto.randomUUID(),
    prescriptionId: prescription.id,
    brandName: input.brandName,
    currentStock: input.currentStock,
    strength: input.strength,
    unit: input.unit,
    pillShape: input.pillShape,
    pillColor: input.pillColor,
    visualIdentification: input.visualIdentification,
    refillAlertDays: input.refillAlertDays,
    refillAlertPills: input.refillAlertPills,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const schedules: PhaseSchedule[] = input.schedules.map(s => ({
    id: crypto.randomUUID(),
    phaseId: phase.id,
    time: s.time,
    dosage: s.dosage,
    daysOfWeek: s.daysOfWeek,
    enabled: true,
    createdAt: now,
  }));

  await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.inventoryItems, db.phaseSchedules, db.inventoryTransactions], async () => {
    await db.prescriptions.add(prescription);
    await db.medicationPhases.add(phase);
    await db.inventoryItems.add(inventory);
    await db.phaseSchedules.bulkAdd(schedules);
    
    if (input.currentStock > 0) {
      await db.inventoryTransactions.add({
        id: crypto.randomUUID(),
        inventoryItemId: inventory.id,
        timestamp: now,
        amount: input.currentStock,
        type: "refill",
        note: "Initial stock"
      });
    }
  });

  return { prescription, phase, inventory, schedules };
}

export interface AddMedicationToPrescriptionInput {
  prescriptionId: string;
  // Phase level
  unit: string;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  
  // Inventory level
  brandName: string;
  currentStock: number;
  strength: number;
  pillShape: PillShape;
  pillColor: string;
  visualIdentification?: string;
  refillAlertDays?: number;
  refillAlertPills?: number;

  // Schedules
  schedules: { time: string; daysOfWeek: number[], dosage: number }[];
}

export async function addMedicationToPrescription(input: AddMedicationToPrescriptionInput): Promise<void> {
  const now = Date.now();
  
  const phase: MedicationPhase = {
    id: crypto.randomUUID(),
    prescriptionId: input.prescriptionId,
    type: "maintenance",
    unit: input.unit,
    startDate: now,
    foodInstruction: input.foodInstruction,
    foodNote: input.foodNote,
    status: "active",
    createdAt: now,
  };

  const inventory: InventoryItem = {
    id: crypto.randomUUID(),
    prescriptionId: input.prescriptionId,
    brandName: input.brandName,
    currentStock: input.currentStock,
    strength: input.strength,
    unit: input.unit,
    pillShape: input.pillShape,
    pillColor: input.pillColor,
    visualIdentification: input.visualIdentification,
    refillAlertDays: input.refillAlertDays,
    refillAlertPills: input.refillAlertPills,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const schedules: PhaseSchedule[] = input.schedules.map(s => ({
    id: crypto.randomUUID(),
    phaseId: phase.id,
    time: s.time,
    dosage: s.dosage,
    daysOfWeek: s.daysOfWeek,
    enabled: true,
    createdAt: now,
  }));

  await db.transaction("rw", [db.medicationPhases, db.inventoryItems, db.phaseSchedules, db.inventoryTransactions], async () => {
    // Archive existing active inventory for this prescription
    const existingInventory = await db.inventoryItems.where("prescriptionId").equals(input.prescriptionId).toArray();
    for (const item of existingInventory) {
      if (item.isActive) {
        await db.inventoryItems.update(item.id, { isActive: false, isArchived: true, updatedAt: now });
      }
    }

    // Complete existing active phase
    const existingPhases = await db.medicationPhases.where("prescriptionId").equals(input.prescriptionId).toArray();
    for (const p of existingPhases) {
      if (p.status === "active") {
        await db.medicationPhases.update(p.id, { status: "completed", endDate: now });
      }
    }

    await db.medicationPhases.add(phase);
    await db.inventoryItems.add(inventory);
    await db.phaseSchedules.bulkAdd(schedules);
    
    if (input.currentStock > 0) {
      await db.inventoryTransactions.add({
        id: crypto.randomUUID(),
        inventoryItemId: inventory.id,
        timestamp: now,
        amount: input.currentStock,
        type: "refill",
        note: "Initial stock"
      });
    }
  });
}

export async function updatePrescription(
  id: string,
  updates: Partial<Omit<Prescription, "id" | "createdAt">>
): Promise<void> {
  await db.prescriptions.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deletePrescription(id: string): Promise<void> {
  await db.transaction("rw", [db.prescriptions, db.medicationPhases, db.phaseSchedules, db.inventoryItems, db.doseLogs], async () => {
    await db.doseLogs.where("prescriptionId").equals(id).delete();
    await db.inventoryItems.where("prescriptionId").equals(id).delete();
    const phases = await db.medicationPhases.where("prescriptionId").equals(id).toArray();
    for (const p of phases) {
      await db.phaseSchedules.where("phaseId").equals(p.id).delete();
    }
    await db.medicationPhases.where("prescriptionId").equals(id).delete();
    await db.prescriptions.delete(id);
  });
}

export async function getPrescriptionById(id: string): Promise<Prescription | undefined> {
  return db.prescriptions.get(id);
}

export async function getPrescriptions(): Promise<Prescription[]> {
  return db.prescriptions.orderBy("createdAt").reverse().toArray();
}

export async function getActivePrescriptions(): Promise<Prescription[]> {
  const all = await db.prescriptions.toArray();
  return all.filter(p => p.isActive);
}

export async function getInactivePrescriptions(): Promise<Prescription[]> {
  const all = await db.prescriptions.toArray();
  return all.filter(p => !p.isActive);
}

export async function getInventoryForPrescription(prescriptionId: string): Promise<InventoryItem[]> {
  return db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
}

export async function getActiveInventoryForPrescription(prescriptionId: string): Promise<InventoryItem | undefined> {
  const items = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
  return items.find(i => i.isActive);
}

export async function getAllInventoryItems(): Promise<InventoryItem[]> {
  return db.inventoryItems.toArray();
}

export async function getAllActiveInventoryItems(): Promise<InventoryItem[]> {
  const all = await db.inventoryItems.toArray();
  return all.filter(i => i.isActive);
}

export async function addInventoryItem(input: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">): Promise<InventoryItem> {
  const now = Date.now();
  const item: InventoryItem = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await db.inventoryItems.add(item);
  return item;
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<Omit<InventoryItem, "id" | "createdAt" | "prescriptionId">>
): Promise<void> {
  await db.inventoryItems.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await db.inventoryItems.delete(id);
}

export async function getActivePhaseForPrescription(prescriptionId: string): Promise<MedicationPhase | undefined> {
  const phases = await db.medicationPhases.where("prescriptionId").equals(prescriptionId).toArray();
  return phases.find(p => p.status === "active");
}

export async function getPhasesForPrescription(prescriptionId: string): Promise<MedicationPhase[]> {
  return db.medicationPhases.where("prescriptionId").equals(prescriptionId).reverse().sortBy("createdAt");
}

export async function adjustStock(
  inventoryItemId: string, 
  delta: number, 
  note?: string, 
  type?: "refill" | "consumed" | "adjusted"
): Promise<number> {
  const item = await db.inventoryItems.get(inventoryItemId);
  if (!item) throw new Error(`InventoryItem ${inventoryItemId} not found`);
  const newStock = Math.max(0, item.currentStock + delta);
  
  await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions], async () => {
    await db.inventoryItems.update(inventoryItemId, { currentStock: newStock, updatedAt: Date.now() });
    
    await db.inventoryTransactions.add({
      id: crypto.randomUUID(),
      inventoryItemId,
      timestamp: Date.now(),
      amount: delta,
      note,
      type: type || (delta > 0 ? "refill" : "consumed")
    });
  });
  
  return newStock;
}

export async function getInventoryTransactions(inventoryItemId: string) {
  return db.inventoryTransactions
    .where("inventoryItemId")
    .equals(inventoryItemId)
    .reverse()
    .sortBy("timestamp");
}

export interface CreatePhaseInput {
  prescriptionId: string;
  type: "maintenance" | "titration";
  unit: string;
  startDate: number;
  endDate?: number;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  notes?: string;
  schedules: { time: string; daysOfWeek: number[], dosage: number }[];
}

export interface UpdatePhaseInput {
  id: string;
  type?: "maintenance" | "titration";
  unit?: string;
  startDate?: number;
  endDate?: number;
  foodInstruction?: FoodInstruction;
  foodNote?: string;
  notes?: string;
  status?: "active" | "completed" | "cancelled" | "pending";
  schedules?: { id?: string; time: string; daysOfWeek: number[], dosage: number }[];
}

export async function updatePhase(input: UpdatePhaseInput): Promise<void> {
  await db.transaction("rw", [db.medicationPhases, db.phaseSchedules], async () => {
    const { id, schedules, ...updates } = input;
    
    if (Object.keys(updates).length > 0) {
      await db.medicationPhases.update(id, updates);
    }
    
    if (schedules) {
      const existingSchedules = await db.phaseSchedules.where("phaseId").equals(id).toArray();
      const existingIds = new Set(existingSchedules.map(s => s.id));
      
      const toAdd = [];
      const toUpdate = [];
      const keptIds = new Set<string>();
      
      for (const s of schedules) {
        if (s.id && existingIds.has(s.id)) {
          toUpdate.push(s);
          keptIds.add(s.id);
        } else {
          toAdd.push({
            id: crypto.randomUUID(),
            phaseId: id,
            time: s.time,
            dosage: s.dosage,
            daysOfWeek: s.daysOfWeek,
            enabled: true,
            createdAt: Date.now(),
          });
        }
      }
      
      const toDelete = Array.from(existingIds).filter(sid => !keptIds.has(sid));
      
      if (toDelete.length > 0) await db.phaseSchedules.bulkDelete(toDelete);
      if (toAdd.length > 0) await db.phaseSchedules.bulkAdd(toAdd);
      for (const u of toUpdate) {
        await db.phaseSchedules.update(u.id!, {
          time: u.time,
          dosage: u.dosage,
          daysOfWeek: u.daysOfWeek,
        });
      }
    }
  });
}

export async function deletePhase(id: string): Promise<void> {
  await db.transaction("rw", [db.medicationPhases, db.phaseSchedules], async () => {
    await db.phaseSchedules.where("phaseId").equals(id).delete();
    await db.medicationPhases.delete(id);
  });
}

export async function activatePhase(id: string): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", [db.medicationPhases], async () => {
    const phase = await db.medicationPhases.get(id);
    if (!phase) throw new Error("Phase not found");

    // Complete the currently active phase for this prescription
    const activePhases = await db.medicationPhases
      .where("prescriptionId")
      .equals(phase.prescriptionId)
      .toArray();
      
    const currentActive = activePhases.find(p => p.status === "active");
    if (currentActive) {
      await db.medicationPhases.update(currentActive.id, { 
        status: "completed", 
        endDate: currentActive.endDate || now 
      });
    }

    // Activate the pending phase
    await db.medicationPhases.update(id, { status: "active", startDate: now });
  });
}

export async function startNewPhase(input: CreatePhaseInput): Promise<MedicationPhase> {
  const now = Date.now();
  
  return await db.transaction("rw", [db.medicationPhases, db.phaseSchedules], async () => {
    const isFuture = input.startDate && input.startDate > now;
    const status = isFuture ? "pending" : "active";

    // Find currently active phase and complete it ONLY if the new phase is active
    if (status === "active") {
      const activePhases = await db.medicationPhases
        .where("prescriptionId")
        .equals(input.prescriptionId)
        .toArray();
        
      const currentActive = activePhases.find(p => p.status === "active");
      if (currentActive) {
        await db.medicationPhases.update(currentActive.id, { 
          status: "completed", 
          endDate: currentActive.endDate || now 
        });
      }
    }

    const phase: MedicationPhase = {
      id: crypto.randomUUID(),
      prescriptionId: input.prescriptionId,
      type: input.type,
      unit: input.unit,
      startDate: input.startDate || now,
      endDate: input.endDate,
      foodInstruction: input.foodInstruction,
      foodNote: input.foodNote,
      notes: input.notes,
      status: status,
      createdAt: now,
    };
    
    await db.medicationPhases.add(phase);

    const schedules: PhaseSchedule[] = input.schedules.map(s => ({
      id: crypto.randomUUID(),
      phaseId: phase.id,
      time: s.time,
      dosage: s.dosage,
      daysOfWeek: s.daysOfWeek,
      enabled: true,
      createdAt: now,
    }));
    await db.phaseSchedules.bulkAdd(schedules);

    return phase;
  });
}
