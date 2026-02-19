import { db, type MedicationSchedule, type Medication } from "./db";

export interface CreateScheduleInput {
  medicationId: string;
  time: string;
  daysOfWeek: number[];
}

export async function addSchedule(input: CreateScheduleInput): Promise<MedicationSchedule> {
  const schedule: MedicationSchedule = {
    id: crypto.randomUUID(),
    ...input,
    enabled: true,
    createdAt: Date.now(),
  };
  await db.medicationSchedules.add(schedule);
  return schedule;
}

export async function updateSchedule(
  id: string,
  updates: Partial<Omit<MedicationSchedule, "id" | "createdAt">>
): Promise<void> {
  await db.medicationSchedules.update(id, updates);
}

export async function deleteSchedule(id: string): Promise<void> {
  await db.medicationSchedules.delete(id);
}

export async function getSchedulesForMedication(medicationId: string): Promise<MedicationSchedule[]> {
  return db.medicationSchedules.where("medicationId").equals(medicationId).toArray();
}

export async function getAllEnabledSchedules(): Promise<MedicationSchedule[]> {
  return db.medicationSchedules.where("enabled").equals(1).toArray();
}

export interface ScheduleWithMedication {
  schedule: MedicationSchedule;
  medication: Medication;
}

export async function getDailySchedule(dayOfWeek: number): Promise<Map<string, ScheduleWithMedication[]>> {
  const schedules = await getAllEnabledSchedules();
  const medications = await db.medications.toArray();
  const medMap = new Map(medications.map((m) => [m.id, m]));

  const grouped = new Map<string, ScheduleWithMedication[]>();

  for (const schedule of schedules) {
    if (!schedule.daysOfWeek.includes(dayOfWeek)) continue;
    const medication = medMap.get(schedule.medicationId);
    if (!medication) continue;

    const existing = grouped.get(schedule.time) ?? [];
    existing.push({ schedule, medication });
    grouped.set(schedule.time, existing);
  }

  const sorted = new Map<string, ScheduleWithMedication[]>(
    Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))
  );

  return sorted;
}
