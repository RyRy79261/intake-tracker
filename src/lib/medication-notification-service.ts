import { db, type Medication } from "./db";
import { showNotification, getNotificationPermission } from "./push-notification-service";
import { getAllEnabledSchedules, type ScheduleWithMedication } from "./medication-schedule-service";

const MED_NOTIFICATION_KEY = "intake-tracker-med-notifications";

interface MedNotificationState {
  lastDoseCheck: number | null;
  lastRefillCheck: number | null;
  notifiedDoses: string[];
  notifiedRefills: string[];
}

function getState(): MedNotificationState {
  if (typeof window === "undefined") {
    return { lastDoseCheck: null, lastRefillCheck: null, notifiedDoses: [], notifiedRefills: [] };
  }
  try {
    const stored = localStorage.getItem(MED_NOTIFICATION_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { lastDoseCheck: null, lastRefillCheck: null, notifiedDoses: [], notifiedRefills: [] };
}

function saveState(updates: Partial<MedNotificationState>): void {
  if (typeof window === "undefined") return;
  const current = getState();
  try {
    localStorage.setItem(MED_NOTIFICATION_KEY, JSON.stringify({ ...current, ...updates }));
  } catch {}
}

export async function showDoseReminder(
  medications: { name: string; time: string }[]
): Promise<boolean> {
  if (getNotificationPermission() !== "granted" || medications.length === 0) return false;

  const names = medications.map((m) => m.name).join(", ");
  const time = medications[0].time;

  return showNotification(`Time for your ${time} medications`, {
    body: names,
    tag: `dose-reminder-${time}`,
    requireInteraction: true,
  });
}

export async function showRefillAlert(medication: Medication, daysLeft: number): Promise<boolean> {
  if (getNotificationPermission() !== "granted") return false;

  return showNotification(`Refill needed: ${medication.brandName}`, {
    body: `${medication.currentStock} pills left (~${daysLeft} days). Time to refill ${medication.brandName} ${medication.dosageStrength}.`,
    tag: `refill-${medication.id}`,
  });
}

export async function checkDoseReminders(): Promise<void> {
  if (getNotificationPermission() !== "granted") return;

  const state = getState();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayKey = now.toISOString().split("T")[0];

  const schedules = await getAllEnabledSchedules();
  const medications = await db.medications.where("isActive").equals(1).toArray();
  const medMap = new Map(medications.map((m) => [m.id, m]));

  const dayOfWeek = now.getDay();
  const dueNow: { name: string; time: string }[] = [];

  for (const schedule of schedules) {
    if (!schedule.daysOfWeek.includes(dayOfWeek)) continue;
    const med = medMap.get(schedule.medicationId);
    if (!med) continue;

    const [schedH, schedM] = schedule.time.split(":").map(Number);
    const [nowH, nowM] = currentTime.split(":").map(Number);
    const schedMinutes = schedH * 60 + schedM;
    const nowMinutes = nowH * 60 + nowM;

    const diff = nowMinutes - schedMinutes;
    if (diff >= 0 && diff <= 5) {
      const doseKey = `${todayKey}-${schedule.time}-${med.id}`;
      if (!state.notifiedDoses.includes(doseKey)) {
        dueNow.push({
          name: `${med.brandName} ${med.dosageStrength}`,
          time: schedule.time,
        });
        state.notifiedDoses.push(doseKey);
      }
    }
  }

  if (dueNow.length > 0) {
    await showDoseReminder(dueNow);
  }

  const cleanedDoses = state.notifiedDoses.filter((key) => key.startsWith(todayKey));
  saveState({ lastDoseCheck: Date.now(), notifiedDoses: cleanedDoses });
}

export async function checkRefillAlerts(): Promise<void> {
  if (getNotificationPermission() !== "granted") return;

  const state = getState();
  const now = Date.now();

  if (state.lastRefillCheck && now - state.lastRefillCheck < 12 * 60 * 60 * 1000) {
    return;
  }

  const medications = await db.medications.where("isActive").equals(1).toArray();
  const schedules = await getAllEnabledSchedules();

  const dosesPerDay = new Map<string, number>();
  for (const sched of schedules) {
    const current = dosesPerDay.get(sched.medicationId) ?? 0;
    dosesPerDay.set(sched.medicationId, current + sched.daysOfWeek.length / 7);
  }

  const newRefillNotifications: string[] = [];

  for (const med of medications) {
    const dailyDoses = dosesPerDay.get(med.id) ?? 1;
    const dailyPills = med.dosageAmount * dailyDoses;
    const daysLeft = dailyPills > 0 ? Math.floor(med.currentStock / dailyPills) : Infinity;

    let shouldAlert = false;
    if (med.refillAlertDays && daysLeft <= med.refillAlertDays) shouldAlert = true;
    if (med.refillAlertPills && med.currentStock <= med.refillAlertPills) shouldAlert = true;

    if (shouldAlert && !state.notifiedRefills.includes(med.id)) {
      await showRefillAlert(med, daysLeft);
      newRefillNotifications.push(med.id);
    }
  }

  saveState({
    lastRefillCheck: now,
    notifiedRefills: [...state.notifiedRefills, ...newRefillNotifications],
  });
}

let checkInterval: ReturnType<typeof setInterval> | null = null;

export function startMedicationNotifications(): void {
  if (checkInterval) return;

  checkDoseReminders();
  checkRefillAlerts();

  checkInterval = setInterval(() => {
    checkDoseReminders();
  }, 60 * 1000);
}

export function stopMedicationNotifications(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
