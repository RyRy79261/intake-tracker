import { db, type Medication, type PillShape, type FoodInstruction } from "./db";

export interface CreateMedicationInput {
  brandName: string;
  genericName: string;
  dosageStrength: string;
  dosageAmount: number;
  pillShape: PillShape;
  pillColor: string;
  indication: string;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  currentStock: number;
  refillAlertDays?: number;
  refillAlertPills?: number;
  notes?: string;
}

export async function addMedication(input: CreateMedicationInput): Promise<Medication> {
  const now = Date.now();
  const medication: Medication = {
    id: crypto.randomUUID(),
    ...input,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.medications.add(medication);
  return medication;
}

export async function updateMedication(
  id: string,
  updates: Partial<Omit<Medication, "id" | "createdAt">>
): Promise<void> {
  await db.medications.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteMedication(id: string): Promise<void> {
  await db.transaction("rw", [db.medications, db.medicationSchedules, db.doseLogs], async () => {
    await db.doseLogs.where("medicationId").equals(id).delete();
    await db.medicationSchedules.where("medicationId").equals(id).delete();
    await db.medications.delete(id);
  });
}

export async function getMedicationById(id: string): Promise<Medication | undefined> {
  return db.medications.get(id);
}

export async function getMedications(): Promise<Medication[]> {
  return db.medications.orderBy("createdAt").reverse().toArray();
}

export async function getActiveMedications(): Promise<Medication[]> {
  return db.medications.where("isActive").equals(1).toArray();
}

export async function getInactiveMedications(): Promise<Medication[]> {
  return db.medications.where("isActive").equals(0).toArray();
}

export async function adjustStock(id: string, delta: number): Promise<number> {
  const med = await db.medications.get(id);
  if (!med) throw new Error(`Medication ${id} not found`);
  const newStock = Math.max(0, med.currentStock + delta);
  await db.medications.update(id, { currentStock: newStock, updatedAt: Date.now() });
  if (newStock === 0 && med.isActive) {
    await db.medications.update(id, { isActive: false, updatedAt: Date.now() });
  }
  return newStock;
}
