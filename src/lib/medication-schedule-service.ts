import { db, type PhaseSchedule, type Prescription, type MedicationPhase, type InventoryItem } from "./db";

export interface ScheduleWithDetails {
  schedule: PhaseSchedule;
  phase: MedicationPhase;
  prescription: Prescription;
  inventory?: InventoryItem;
}

export async function getDailySchedule(dayOfWeek: number): Promise<Map<string, ScheduleWithDetails[]>> {
  // 1. Get all active prescriptions
  const allPrescriptions = await db.prescriptions.toArray();
  const activePrescriptions = allPrescriptions.filter(p => p.isActive);
  const prescriptionMap = new Map(activePrescriptions.map(p => [p.id, p]));
  
  // 2. Get active phases for these prescriptions
  const prescriptionIds = activePrescriptions.map(p => p.id);
  const phases = await db.medicationPhases.where("status").equals("active").toArray();
  const activePhases = phases.filter(p => prescriptionIds.includes(p.prescriptionId));
  const phaseMap = new Map(activePhases.map(p => [p.id, p]));
  
  // 3. Get active inventory for these prescriptions
  const allInventoryItems = await db.inventoryItems.toArray();
  const inventoryItems = allInventoryItems.filter(i => i.isActive && !i.isArchived);
  const inventoryMap = new Map(inventoryItems.map(i => [i.prescriptionId, i]));

  // 4. Get enabled schedules for these active phases
  const phaseIds = activePhases.map(p => p.id);
  const allSchedules = await db.phaseSchedules.toArray();
  const activeSchedules = allSchedules.filter(s => s.enabled && phaseIds.includes(s.phaseId) && s.daysOfWeek.includes(dayOfWeek));

  const grouped = new Map<string, ScheduleWithDetails[]>();

  for (const schedule of activeSchedules) {
    const phase = phaseMap.get(schedule.phaseId);
    if (!phase) continue;
    const prescription = prescriptionMap.get(phase.prescriptionId);
    if (!prescription) continue;
    const inventory = inventoryMap.get(prescription.id);

    const existing = grouped.get(schedule.time) ?? [];
    existing.push({ schedule, phase, prescription, inventory });
    grouped.set(schedule.time, existing);
  }

  const sorted = new Map<string, ScheduleWithDetails[]>(
    Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))
  );

  return sorted;
}

export async function getSchedulesForPhase(phaseId: string): Promise<PhaseSchedule[]> {
  return db.phaseSchedules.where("phaseId").equals(phaseId).toArray();
}

export async function addSchedule(input: Omit<PhaseSchedule, "id" | "createdAt" | "enabled">): Promise<PhaseSchedule> {
  const schedule: PhaseSchedule = {
    ...input,
    id: crypto.randomUUID(),
    enabled: true,
    createdAt: Date.now(),
  };
  await db.phaseSchedules.add(schedule);
  return schedule;
}

export async function updateSchedule(
  id: string,
  updates: Partial<Omit<PhaseSchedule, "id" | "createdAt" | "phaseId">>
): Promise<void> {
  await db.phaseSchedules.update(id, updates);
}

export async function deleteSchedule(id: string): Promise<void> {
  await db.phaseSchedules.delete(id);
}
