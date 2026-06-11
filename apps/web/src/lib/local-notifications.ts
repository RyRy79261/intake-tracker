import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { db } from "@/lib/db";
import { isCombo, splitDose, formatCompoundShort } from "@/lib/compound-utils";

export async function initLocalNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const permResult = await LocalNotifications.requestPermissions();
  if (permResult.display !== "granted") {
    console.error("[local-notifications] Permission denied");
    return;
  }

  await syncMedicationNotifications();
}

export async function syncMedicationNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications });
  }

  const schedules = await db.phaseSchedules
    .filter((s) => s.enabled && s.deletedAt === null)
    .toArray();

  if (schedules.length === 0) return;

  const phaseIds = [...new Set(schedules.map((s) => s.phaseId))];
  const phases = await db.medicationPhases
    .where("id")
    .anyOf(phaseIds)
    .filter((p) => p.status === "active" && p.deletedAt === null)
    .toArray();
  const activePhaseIds = new Set(phases.map((p) => p.id));

  const prescriptionIds = [
    ...new Set(phases.map((p) => p.prescriptionId)),
  ];
  const prescriptions = await db.prescriptions
    .where("id")
    .anyOf(prescriptionIds)
    .filter((p) => p.isActive && p.deletedAt === null)
    .toArray();
  const prescriptionMap = new Map(prescriptions.map((p) => [p.id, p]));

  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    schedule: {
      on: { hour: number; minute: number; weekday: number };
      allowWhileIdle: boolean;
    };
  }> = [];

  let notifId = 1;

  for (const schedule of schedules) {
    if (!activePhaseIds.has(schedule.phaseId)) continue;

    const phase = phases.find((p) => p.id === schedule.phaseId);
    if (!phase) continue;

    const prescription = prescriptionMap.get(phase.prescriptionId);
    if (!prescription) continue;

    const utcMinutes = schedule.scheduleTimeUTC;
    const hour = Math.floor(utcMinutes / 60) % 24;
    const minute = utcMinutes % 60;

    const unit = phase.unit ?? "mg";
    const dosageText = isCombo(prescription)
      ? formatCompoundShort(splitDose(schedule.dosage, prescription.compounds), unit)
      : `${schedule.dosage}${unit}`;

    for (const dow of schedule.daysOfWeek) {
      // Capacitor weekday: 1=Sunday, 2=Monday, ..., 7=Saturday
      // Dexie daysOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday
      const capWeekday = dow + 1;

      notifications.push({
        id: notifId++,
        title: `Time for ${prescription.genericName}`,
        body: `Take ${dosageText} of ${prescription.genericName}`,
        schedule: {
          on: { hour, minute, weekday: capWeekday },
          allowWhileIdle: true,
        },
      });
    }
  }

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }
}
