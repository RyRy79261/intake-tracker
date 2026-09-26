import { db } from "@/lib/db";
import { showNotification, getNotificationPermission } from "@/lib/push-notification-service";
import { isCombo, formatCompoundShort } from "@intake/core/compound";
import {
  loadReminderDoses,
  buildReminderOccurrences,
  loadHandledSlots,
} from "@/lib/medication-reminder-builder";
import { getDeviceTimezone } from "@/lib/timezone";
import { toLocalDateKey } from "@/lib/date-utils";
import { getRefillStatuses, reconcileRefillNotifications } from "@/lib/refill-status";

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

async function showRefillAlert(brandName: string, dosageStrength: string, id: string, currentStock: number, daysLeft: number | null): Promise<boolean> {
  if (getNotificationPermission() !== "granted") return false;

  const supply = daysLeft === null ? "" : ` (~${daysLeft} days)`;
  return showNotification(`Refill needed: ${brandName}`, {
    body: `${currentStock} pills left${supply}. Time to refill ${brandName} ${dosageStrength}.`,
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

  // Same decision as the cards and the inventory drawer (computeRefillStatus
  // over the effective phase). A prescription drops out of notifiedRefills once
  // it no longer needs a refill, so running low again alerts again.
  const statuses = await getRefillStatuses();
  const { toNotify, notified } = reconcileRefillNotifications(state.notifiedRefills, statuses);

  for (const { prescriptionId, prescription, inventory, status } of statuses) {
    if (!toNotify.includes(prescriptionId)) continue;
    await showRefillAlert(
      inventory.brandName || prescription.genericName,
      isCombo(inventory)
        ? formatCompoundShort(inventory.compounds, inventory.unit)
        : `${inventory.strength}${inventory.unit}`,
      prescriptionId,
      status.stock,
      status.daysLeft,
    );
  }

  saveState({
    lastRefillCheck: now,
    notifiedRefills: notified,
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
