import { db } from "@/lib/db";
import { showNotification, getNotificationPermission } from "@/lib/push-notification-service";
import { getSchedulesForPhase } from "@/lib/medication-schedule-service";
import { isCombo, formatCompoundShort } from "@intake/core/compound";
import {
  loadReminderDoses,
  buildReminderOccurrences,
  loadHandledSlots,
} from "@/lib/medication-reminder-builder";
import { getDeviceTimezone } from "@/lib/timezone";
import { toLocalDateKey } from "@/lib/date-utils";

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
  } catch {
    // localStorage unavailable or corrupt — fall through to the default state.
  }
  return { lastDoseCheck: null, lastRefillCheck: null, notifiedDoses: [], notifiedRefills: [] };
}

function saveState(updates: Partial<MedNotificationState>): void {
  if (typeof window === "undefined") return;
  const current = getState();
  try {
    localStorage.setItem(MED_NOTIFICATION_KEY, JSON.stringify({ ...current, ...updates }));
  } catch {
    // Best-effort persistence — ignore quota/availability errors.
  }
}

async function showDoseReminder(
  medications: { name: string; time: string }[]
): Promise<boolean> {
  const firstMed = medications[0];
  if (getNotificationPermission() !== "granted" || medications.length === 0 || !firstMed) return false;

  const names = medications.map((m) => m.name).join(", ");
  const time = firstMed.time;

  return showNotification(`Time for your ${time} medications`, {
    body: names,
    // Same tag as the server push for this slot, so the two replace each
    // other instead of stacking.
    tag: `dose-${time}`,
    requireInteraction: true,
  });
}

async function showRefillAlert(brandName: string, dosageStrength: string, id: string, currentStock: number, daysLeft: number): Promise<boolean> {
  if (getNotificationPermission() !== "granted") return false;

  return showNotification(`Refill needed: ${brandName}`, {
    body: `${currentStock} pills left (~${daysLeft} days). Time to refill ${brandName} ${dosageStrength}.`,
    tag: `refill-${id}`,
  });
}

/** A dose is announced from its due time until this long after it. */
const DOSE_REMINDER_WINDOW_MS = 5 * 60 * 1000;

export async function checkDoseReminders(now: number = Date.now()): Promise<void> {
  if (getNotificationPermission() !== "granted") return;

  const state = getState();
  const doses = await loadReminderDoses();
  // Due within the last few minutes, per the same builder native and push use.
  const occurrences = buildReminderOccurrences(doses, {
    from: now - DOSE_REMINDER_WINDOW_MS,
    days: 1,
    deviceTz: getDeviceTimezone(),
  }).filter((o) => o.at <= now);
  const handled = await loadHandledSlots(occurrences);

  const dueNow: { name: string; time: string }[] = [];
  const notified: string[] = [];
  let slotTime: string | undefined;
  for (const o of occurrences) {
    // Keyed by the dose's own date, not the UTC date.
    const doseKey = `${o.dateKey}-${o.dose.scheduleId}`;
    if (state.notifiedDoses.includes(doseKey)) continue;
    if (handled.has(`${o.dose.scheduleId}|${o.dateKey}`)) continue;
    // One notification per slot: later slots wait for the next tick.
    if (slotTime !== undefined && o.localTime !== slotTime) continue;
    slotTime = o.localTime;
    dueNow.push({ name: `${o.dose.displayName} ${o.dose.dosageText}`, time: o.localTime });
    notified.push(doseKey);
  }

  if (dueNow.length > 0) {
    await showDoseReminder(dueNow);
  }

  // Keep keys for the last two days; older ones can never match again.
  const cutoff = toLocalDateKey(now - 2 * 24 * 60 * 60 * 1000);
  const cleanedDoses = [...state.notifiedDoses, ...notified].filter((key) => key.slice(0, 10) >= cutoff);
  saveState({ lastDoseCheck: now, notifiedDoses: cleanedDoses });
}

async function checkRefillAlerts(): Promise<void> {
  if (getNotificationPermission() !== "granted") return;

  const state = getState();
  const now = Date.now();

  if (state.lastRefillCheck && now - state.lastRefillCheck < 12 * 60 * 60 * 1000) {
    return;
  }

  const allRxs = await db.prescriptions.toArray();
  const activePrescriptions = allRxs.filter(p => p.isActive === true);
  const newRefillNotifications: string[] = [];

  for (const prescription of activePrescriptions) {
    const activePhase = await db.medicationPhases
      .where("prescriptionId")
      .equals(prescription.id)
      .toArray()
      .then(phases => phases.find(p => p.status === "active"));

    if (!activePhase) continue;

    let schedules;
    try {
      schedules = await getSchedulesForPhase(activePhase.id);
    } catch {
      continue;
    }

    const inventories = await db.inventoryItems.where("prescriptionId").equals(prescription.id).toArray();
    const activeInventory = inventories.find(i => i.isActive && !i.isArchived);

    if (!activeInventory) continue;

    const stock = activeInventory.currentStock ?? 0;
    const dailyDosage = schedules.reduce((acc, sched) => acc + (sched.dosage * (sched.daysOfWeek.length / 7)), 0);
    const dailyPills = activeInventory.strength > 0 ? dailyDosage / activeInventory.strength : 0;

    const daysLeft = dailyPills > 0 ? Math.floor(stock / dailyPills) : Infinity;

    let shouldAlert = false;
    if (activeInventory.refillAlertDays !== undefined && daysLeft <= activeInventory.refillAlertDays) shouldAlert = true;
    if (activeInventory.refillAlertPills !== undefined && stock <= activeInventory.refillAlertPills) shouldAlert = true;

    if (shouldAlert && !state.notifiedRefills.includes(prescription.id)) {
      await showRefillAlert(
        activeInventory.brandName || prescription.genericName,
        isCombo(activeInventory)
          ? formatCompoundShort(activeInventory.compounds, activeInventory.unit)
          : `${activeInventory.strength}${activeInventory.unit}`,
        prescription.id,
        stock,
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
