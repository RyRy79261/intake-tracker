import { db, type Prescription, type MedicationPhase, type InventoryItem } from "./db";
import { showNotification, getNotificationPermission } from "./push-notification-service";
import { getSchedulesForPhase } from "./medication-schedule-service";

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

export async function showRefillAlert(brandName: string, dosageStrength: string, id: string, currentStock: number, daysLeft: number): Promise<boolean> {
  if (getNotificationPermission() !== "granted") return false;

  return showNotification(`Refill needed: ${brandName}`, {
    body: `${currentStock} pills left (~${daysLeft} days). Time to refill ${brandName} ${dosageStrength}.`,
    tag: `refill-${id}`,
  });
}

export async function checkDoseReminders(): Promise<void> {
  if (getNotificationPermission() !== "granted") return;

  const state = getState();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayKey = now.toISOString().split("T")[0];

  const activePrescriptions = await db.prescriptions.where("isActive").equals(1).toArray();
  const prescriptionMap = new Map(activePrescriptions.map(p => [p.id, p]));
  
  const phases = await db.medicationPhases.where("status").equals("active").toArray();
  const phaseMap = new Map(phases.map(p => [p.id, p]));

  const allSchedules = await db.phaseSchedules.where("enabled").equals(1).toArray();

  const dayOfWeek = now.getDay();
  const dueNow: { name: string; time: string }[] = [];

  for (const schedule of allSchedules) {
    if (!schedule.daysOfWeek.includes(dayOfWeek)) continue;
    
    const phase = phaseMap.get(schedule.phaseId);
    if (!phase) continue;
    
    const prescription = prescriptionMap.get(phase.prescriptionId);
    if (!prescription) continue;

    const [schedH, schedM] = schedule.time.split(":").map(Number);
    const [nowH, nowM] = currentTime.split(":").map(Number);
    const schedMinutes = schedH * 60 + schedM;
    const nowMinutes = nowH * 60 + nowM;

    const diff = nowMinutes - schedMinutes;
    if (diff >= 0 && diff <= 5) {
      const doseKey = `${todayKey}-${schedule.time}-${prescription.id}`;
      if (!state.notifiedDoses.includes(doseKey)) {
        // Find inventory name if available, else generic
        const activeInv = await db.inventoryItems.where("prescriptionId").equals(prescription.id).toArray();
        const inv = activeInv.find(i => i.isActive && !i.isArchived) || activeInv[0];
        const name = inv?.brandName || prescription.genericName;

        dueNow.push({
          name: `${name} ${schedule.dosage}${phase.unit}`,
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

  const activePrescriptions = await db.prescriptions.where("isActive").equals(1).toArray();
  const newRefillNotifications: string[] = [];

  for (const prescription of activePrescriptions) {
    const activePhase = await db.medicationPhases
      .where("prescriptionId")
      .equals(prescription.id)
      .toArray()
      .then(phases => phases.find(p => p.status === "active"));
      
    if (!activePhase) continue;
    
    const schedules = await getSchedulesForPhase(activePhase.id);
    const inventories = await db.inventoryItems.where("prescriptionId").equals(prescription.id).toArray();
    const activeInventory = inventories.find(i => i.isActive && !i.isArchived);
    
    if (!activeInventory) continue;

    const dailyDosage = schedules.reduce((acc, sched) => acc + (sched.dosage * (sched.daysOfWeek.length / 7)), 0);
    const dailyPills = activeInventory.strength > 0 ? dailyDosage / activeInventory.strength : 0;

    const daysLeft = dailyPills > 0 ? Math.floor(activeInventory.currentStock / dailyPills) : Infinity;

    let shouldAlert = false;
    if (activeInventory.refillAlertDays && daysLeft <= activeInventory.refillAlertDays) shouldAlert = true;
    if (activeInventory.refillAlertPills && activeInventory.currentStock <= activeInventory.refillAlertPills) shouldAlert = true;

    if (shouldAlert && !state.notifiedRefills.includes(prescription.id)) {
      await showRefillAlert(
        activeInventory.brandName || prescription.genericName, 
        `${activeInventory.strength}${activeInventory.unit}`, 
        prescription.id, 
        activeInventory.currentStock, 
        daysLeft
      );
      newRefillNotifications.push(prescription.id);
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
