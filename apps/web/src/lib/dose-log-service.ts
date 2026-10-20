import { db, type DoseLog, type DoseStatus } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import { isCleanFraction, isValidPillStrength } from "@intake/core/compound";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { getDeviceTimezone } from "@/lib/timezone";
import { getActiveInventoryForPrescription } from "@/lib/inventory-service";
import { toLocalDateKey } from "@/lib/date-utils";
import { isLive } from "@intake/core/lifecycle";
import { syncedWrite, type SyncedWriter } from "@/lib/synced-write";
import { selectSlotLog } from "@/lib/dose-log-read";
import { reopenedStatus, rescheduleWarnings, type RescheduleWarning } from "@intake/core/dose-rules";
import { zonedWallClockToInstant } from "@/lib/timezone";
import { buildReminderOccurrences, readReminderDoses } from "@/lib/medication-reminder-builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One scheduled dose: its slot key, plus the dose for stock math. */
export interface DoseKey {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  /** The slot's display time; stored on a new log, not part of the key. */
  time: string;
  dosageMg: number;
}

export interface TakeDoseInput extends DoseKey {
  /**
   * When the dose was taken (epoch ms). Absent: now. Any instant is
   * accepted, before the dose time or after now: the user states it.
   */
  takenAt?: number;
}

export type UntakeDoseInput = DoseKey;
export type UnskipDoseInput = DoseKey;

export interface SkipDoseInput extends DoseKey {
  reason?: string;
}

export interface RescheduleDoseInput extends DoseKey {
  /** The new reminder instant (epoch ms). Any instant: there is no limit. */
  remindAt: number;
}

export type CancelRescheduleInput = DoseKey;

/** A reschedule warning for one medicine. It never blocks the save. */
export type DoseRescheduleWarning = RescheduleWarning & { prescriptionId: string };

export interface EditDoseTimeInput extends Omit<DoseKey, "dosageMg"> {
  /** The time the dose was actually taken (epoch ms). */
  takenAt: number;
}

/**
 * One dose a write changed: its log before (undefined when the slot had no
 * log) and after. Undo restores `before` exactly (revertDoseChanges).
 */
export interface DoseChange<K extends DoseKey = DoseKey> {
  key: K;
  before: DoseLog | undefined;
  after: DoseLog;
}

export interface LogPrnDoseInput {
  prescriptionId: string;
  date: string; // "YYYY-MM-DD" — date the dose was taken
  time: string; // "HH:MM" — time the dose was taken
  doseMg?: number; // optional explicit dose recorded on the log
  dosageMg?: number; // dose in mg for inventory pill math; omit to skip stock decrement
  note?: string;
}

// ---------------------------------------------------------------------------
// Fractional pill math helpers (exported for reuse)
// ---------------------------------------------------------------------------

/**
 * Calculate how many pills are consumed for a given dose.
 * Uses 4-decimal rounding to avoid floating-point noise. Returns undefined for
 * an invalid strength (≤ 0, missing or non-finite) — callers must skip the
 * stock write rather than record 0, NaN or ∞ pills.
 */
export function calculatePillsConsumed(doseMg: number, pillStrengthMg: number): number | undefined {
  if (!isValidPillStrength(pillStrengthMg)) return undefined;
  const raw = doseMg / pillStrengthMg;
  return Math.round(raw * 10000) / 10000;
}

// Lives in @intake/core/compound so components can use it without importing
// this service; re-exported for existing callers.
export { isCleanFraction };

// ---------------------------------------------------------------------------
// Scheduled dose identity
// ---------------------------------------------------------------------------
//
// A scheduled dose is identified by (scheduleId, scheduledDate). Never by
// `scheduledTime`: that is the slot's display time, which moves whenever the
// schedule time, the device timezone or the DST offset changes.

/** cyrb128: a small, fast, well-mixed 128-bit string hash (not cryptographic). */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * Deterministic id for a new scheduled dose log. Two devices that log the same
 * slot before syncing write the same row id, so the server's last-write-wins
 * merge converges on one row instead of keeping two (and double-counting the
 * dose). Synchronous on purpose: it runs inside Dexie transactions, where
 * awaiting a non-Dexie promise such as `crypto.subtle` would commit early.
 * UUID-shaped, with version nibble 8 (custom).
 */
export function scheduledDoseLogId(scheduleId: string, date: string): string {
  const hex = cyrb128(`${scheduleId}|${date}`)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Lives in dose-log-read so the reminder builder can use it too.
export { selectSlotLog };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getDoseLogRaw(scheduleId: string, date: string): Promise<DoseLog | undefined> {
  const logs = await db.doseLogs
    .where("[scheduleId+scheduledDate]")
    .equals([scheduleId, date])
    .toArray();
  return selectSlotLog(logs);
}

/**
 * Id for a slot's first log. Falls back to a random id when the deterministic
 * one already belongs to a tombstone: the server never resurrects a deleted
 * row, so reusing it would leave the new log stuck on this device.
 */
async function newScheduledDoseLogId(scheduleId: string, date: string): Promise<string> {
  const id = scheduledDoseLogId(scheduleId, date);
  return (await db.doseLogs.get(id)) ? crypto.randomUUID() : id;
}

type PatchableField =
  | "rescheduledTo" | "remindAt" | "skipReason" | "note" | "inventoryItemId" | "actionTimestamp"
  | "doseAmount" | "doseUnit" | "pillsConsumed" | "pillStrength";

/** Fields to write on a slot's log; an explicit `undefined` clears the field. */
type DoseLogPatch = { [K in PatchableField]?: DoseLog[K] | undefined };

interface SlotRef {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
}

/**
 * Write the slot's log: update `prev` in place, or create it under `id`.
 * Runs inside a caller's synced write. A patch key set to `undefined` clears
 * the field.
 */
async function writeSlotLog(
  w: SyncedWriter,
  prev: DoseLog | undefined,
  id: string,
  slot: SlotRef,
  status: DoseStatus,
  patch: DoseLogPatch = {},
): Promise<DoseLog> {
  const now = w.now;

  if (prev) {
    const written = await w.patch("doseLogs", prev.id, {
      status,
      actionTimestamp: now,
      timezone: getDeviceTimezone(),
      ...patch,
    });
    return written!;
  }

  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<Pick<DoseLog, PatchableField>>;
  const log: DoseLog = {
    id,
    prescriptionId: slot.prescriptionId,
    phaseId: slot.phaseId,
    scheduleId: slot.scheduleId,
    scheduledDate: slot.date,
    scheduledTime: slot.time,
    status,
    actionTimestamp: now,
    ...defined,
    ...syncFields(),
  };
  return w.insert("doseLogs", log);
}

/**
 * Put back the stock a taken dose deducted. Reverses the pills recorded on the
 * log at take time; only legacy logs without that snapshot fall back to the
 * caller's current dose and the item's current strength. Returns the pills
 * restored. Used inside transactions.
 */
async function restoreTakenStock(
  w: SyncedWriter,
  prev: DoseLog | undefined,
  dosageMg: number,
): Promise<number> {
  if (prev?.status !== "taken" || !prev.inventoryItemId) return 0;
  const inventory = await db.inventoryItems.get(prev.inventoryItemId);
  if (!inventory) return 0;

  const pills = prev.pillsConsumed ?? calculatePillsConsumed(dosageMg, inventory.strength) ?? 0;
  if (!(pills > 0)) return 0;

  await moveStock(w, inventory.id, pills, prev.id);
  return pills;
}

/**
 * Take a taken dose's pills out of stock again (undo of an untake or a skip).
 * The exact mirror of restoreTakenStock: the same pills, with the same
 * fallback for a legacy log that has no `pillsConsumed` snapshot, so undo
 * never leaves stock higher than before.
 */
async function debitTakenStock(
  w: SyncedWriter,
  prev: DoseLog,
  dosageMg: number,
  doseLogId: string,
): Promise<void> {
  if (prev.status !== "taken" || !prev.inventoryItemId) return;
  const inventory = await db.inventoryItems.get(prev.inventoryItemId);
  if (!inventory) return;
  const pills = prev.pillsConsumed ?? calculatePillsConsumed(dosageMg, inventory.strength) ?? 0;
  if (!(pills > 0)) return;
  await moveStock(w, inventory.id, -pills, doseLogId);
}

/**
 * Slack for a "taken at" time: the picked minute has no seconds, and the
 * check runs a moment after the user tapped.
 */
const FUTURE_TAKEN_AT_GRACE_MS = 60 * 1000;

/** True when a recorded "taken at" timestamp lies in the future. */
function isFutureTakenAt(timestamp: number, now: number = Date.now()): boolean {
  return timestamp > now + FUTURE_TAKEN_AT_GRACE_MS;
}

/** The tables a scheduled-dose write touches. */
const DOSE_TABLES = [
  "doseLogs",
  "inventoryItems",
  "inventoryTransactions",
  "medicationPhases",
  "phaseSchedules",
] as const;

// ---------------------------------------------------------------------------
// Read functions — return T directly (throw on error)
// ---------------------------------------------------------------------------

export async function getDoseLogsForDate(date: string): Promise<DoseLog[]> {
  const all = await db.doseLogs.where("scheduledDate").equals(date).toArray();
  return all.filter(isLive);
}

/**
 * The log for one dose slot. A slot is (scheduleId, date); the other
 * arguments are kept for call-site compatibility and are not part of the key.
 */
export async function getDoseLog(
  _prescriptionId: string,
  _phaseId: string,
  scheduleId: string,
  date: string,
  _time?: string,
): Promise<DoseLog | undefined> {
  return getDoseLogRaw(scheduleId, date);
}

// ---------------------------------------------------------------------------
// Mutation functions — atomic transactions with audit logging
// ---------------------------------------------------------------------------
//
// Each action has an in-transaction step (`*InTx`) that the single and the
// bulk functions share. A bulk action runs every step in ONE synced write:
// all doses change or none do.

/** A rule the user broke; its message is shown as it is. */
export class DoseRuleError extends Error {}

/** The message to show for a failed dose write. */
function failMessage(e: unknown, fallback: string): string {
  return e instanceof DoseRuleError ? e.message : fallback;
}

/** Refuse to take or skip a dose of a day after today. */
function assertNotFutureDay(date: string, verb: "take" | "skip"): void {
  // A dose cannot be taken ahead of its day: it would debit stock for a pill
  // that is still in the bottle, and the dose is not due yet.
  if (date > toLocalDateKey()) {
    throw new DoseRuleError(`Cannot ${verb} a dose scheduled for a future date`);
  }
}

/** Put a dose's pills back in stock, or take them out again (undo of an untake). */
async function moveStock(
  w: SyncedWriter,
  inventoryItemId: string,
  pills: number,
  doseLogId: string,
): Promise<void> {
  const inventory = await db.inventoryItems.get(inventoryItemId);
  if (!inventory || pills === 0) return;
  const newStock = (inventory.currentStock ?? 0) + pills;
  await w.patch("inventoryItems", inventory.id, {
    currentStock: Math.round(newStock * 10000) / 10000,
  });
  const sf = syncFields();
  await w.insert("inventoryTransactions", {
    id: crypto.randomUUID(),
    inventoryItemId: inventory.id,
    timestamp: Date.now(),
    amount: pills,
    type: "consumed",
    doseLogId,
    createdAt: sf.createdAt,
    updatedAt: sf.updatedAt,
    deletedAt: null,
    deviceId: sf.deviceId,
    timezone: sf.timezone,
  });
}

/**
 * Take one dose inside a synced write. A dose that is already taken is left
 * exactly as it is (no stock moves, its taken time stays): returns null.
 */
async function takeInTx(w: SyncedWriter, input: TakeDoseInput): Promise<DoseChange | null> {
  const { prescriptionId, phaseId, scheduleId, date, time, dosageMg, takenAt } = input;
  assertNotFutureDay(date, "take");
  if (takenAt !== undefined && !Number.isFinite(takenAt)) throw new Error("Invalid time");

  const prev = await getDoseLogRaw(scheduleId, date);
  if (prev?.status === "taken") return null;
  // Resolve the log id first so the consumed transaction can link to it.
  const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));

  // A taken dose has no skip reason; clear one left by an earlier skip.
  const patch: DoseLogPatch = { skipReason: undefined };

  // Find active inventory for this prescription. `isActive` is a boolean and
  // IndexedDB cannot index booleans, so the shared helper filters in memory.
  const inventory = await getActiveInventoryForPrescription(prescriptionId);
  const pills = inventory && calculatePillsConsumed(dosageMg, inventory.strength);
  const invalidStrength = !!inventory && pills === undefined;

  // Snapshot what is being taken, so later schedule or inventory edits
  // cannot rewrite this dose. The item id is only the one debited now: a
  // stale id from an earlier take would let the next undo restore pills that
  // were never taken out.
  const [phase, schedule] = await Promise.all([
    db.medicationPhases.get(phaseId),
    db.phaseSchedules.get(scheduleId),
  ]);
  patch.doseAmount = dosageMg;
  patch.doseUnit = schedule?.unit ?? phase?.unit;
  // An invalid strength debits nothing, so no item is recorded.
  const inventoryItemId = pills !== undefined ? inventory?.id : undefined;
  patch.inventoryItemId = inventoryItemId;
  patch.pillsConsumed = pills ?? 0;
  patch.pillStrength = inventory?.strength;

  // Negative stock is allowed (user decision).
  if (inventory && pills !== undefined) await moveStock(w, inventory.id, -pills, logId);

  if (takenAt !== undefined) patch.actionTimestamp = takenAt;

  const after = await writeSlotLog(
    w, prev, logId, { prescriptionId, phaseId, scheduleId, date, time }, "taken", patch,
  );

  const auditDetails: Record<string, unknown> = {
    prescriptionId, date, time, dosageMg, pillsConsumed: pills ?? 0, inventoryItemId,
  };
  if (pills !== undefined && pills > 0 && !isCleanFraction(pills)) {
    auditDetails.warning = "odd_fraction";
  }
  if (invalidStrength) auditDetails.warning = "invalid_strength";
  await w.audit("dose_taken", auditDetails);

  return { key: input, before: prev, after };
}

/** Skip one dose inside a synced write. A taken dose gets its pills back. */
async function skipInTx(w: SyncedWriter, input: SkipDoseInput): Promise<DoseChange> {
  const { prescriptionId, phaseId, scheduleId, date, time, dosageMg, reason } = input;
  // Skipping ahead of the day would mark a dose that is not yet due.
  assertNotFutureDay(date, "skip");

  const prev = await getDoseLogRaw(scheduleId, date);
  const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));
  const pillsConsumed = await restoreTakenStock(w, prev, dosageMg);

  // Snapshot the dose that was skipped.
  const [phase, schedule] = await Promise.all([
    db.medicationPhases.get(phaseId),
    db.phaseSchedules.get(scheduleId),
  ]);
  const after = await writeSlotLog(
    w, prev, logId, { prescriptionId, phaseId, scheduleId, date, time }, "skipped",
    {
      doseAmount: dosageMg,
      doseUnit: schedule?.unit ?? phase?.unit,
      pillsConsumed: 0,
      // Always written: a skip without a reason clears an older one.
      skipReason: reason,
    },
  );

  await w.audit("dose_skipped", {
    prescriptionId, date, time, dosageMg, pillsConsumed, reason,
    inventoryItemId: prev?.inventoryItemId,
  });
  return { key: input, before: prev, after };
}

/**
 * Reverse a taken dose inside a synced write: its pills go back to stock.
 * The log goes back to open: "rescheduled" while its `remindAt` is still
 * ahead (the reminder is armed again), else "pending" (the Today screen then
 * shows it open or missed by the original time). The log is not soft-deleted: its id is deterministic and the
 * server never resurrects a tombstone, so a later re-take could not sync.
 */
async function untakeInTx(w: SyncedWriter, input: UntakeDoseInput): Promise<DoseChange> {
  const { prescriptionId, phaseId, scheduleId, date, time, dosageMg } = input;
  const prev = await getDoseLogRaw(scheduleId, date);
  const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));
  const pillsConsumed = await restoreTakenStock(w, prev, dosageMg);

  const after = await writeSlotLog(
    w, prev, logId, { prescriptionId, phaseId, scheduleId, date, time },
    reopenedStatus(prev?.remindAt, w.now),
    // Clear a reason left by an earlier skip: the slot is no longer skipped.
    { pillsConsumed: 0, skipReason: undefined },
  );

  await w.audit("dose_untaken", {
    prescriptionId, date, time, dosageMg, pillsConsumed,
    inventoryItemId: prev?.inventoryItemId,
  });
  return { key: input, before: prev, after };
}

/**
 * Reverse a skip inside a synced write: the dose is open again ("rescheduled"
 * while its `remindAt` is ahead) and its reason is cleared. Null when the dose is not skipped.
 */
async function unskipInTx(w: SyncedWriter, input: UnskipDoseInput): Promise<DoseChange | null> {
  const { prescriptionId, phaseId, scheduleId, date, time } = input;
  const prev = await getDoseLogRaw(scheduleId, date);
  if (prev?.status !== "skipped") return null;

  const after = await writeSlotLog(
    w, prev, prev.id, { prescriptionId, phaseId, scheduleId, date, time },
    reopenedStatus(prev.remindAt, w.now),
    { skipReason: undefined },
  );
  await w.audit("dose_untaken", { prescriptionId, date, time, unskipped: true });
  return { key: input, before: prev, after };
}

/**
 * Record a dose as taken. Atomic: dose log + stock decrement + audit log in
 * a single Dexie transaction. Fractional pill math uses dosageMg / pillStrength.
 * A dose that is already taken is returned unchanged: its taken time stays.
 * Use editDoseTime to change it.
 */
export async function takeDose(input: TakeDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const log = await syncedWrite(DOSE_TABLES, async (w) => {
      const change = await takeInTx(w, input);
      return change?.after ?? (await getDoseLogRaw(input.scheduleId, input.date))!;
    });
    return ok(log);
  } catch (e) {
    return err(failMessage(e, "Failed to take dose"), e);
  }
}

/**
 * Log an as-needed (PRN) dose for a prescription with no active phase schedule
 * (e.g. furosemide taken on symptoms). Creates a kind='prn' dose log with no
 * phase/schedule, plus — when the prescription has tracked inventory and a
 * dosage is given — a consumed inventory transaction so stock decrements.
 */
export async function logPrnDose(
  input: LogPrnDoseInput,
): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, date, time, doseMg, dosageMg, note } = input;

    const [hStr, mStr] = time.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    const takenAt = new Date(`${date}T00:00:00`);
    takenAt.setHours(h, m, 0, 0);
    const parsed = takenAt.getTime();
    // A malformed date/time makes setHours(NaN,…) produce an Invalid Date whose
    // getTime() is NaN — never persist that. Fall back to now so
    // actionTimestamp is always a finite number.
    const actionTimestamp = Number.isFinite(parsed) ? parsed : Date.now();

    const log = await syncedWrite(["doseLogs", "inventoryItems", "inventoryTransactions"], async (w) => {
      const sf = syncFields();
      const doseLogId = crypto.randomUUID();

      let inventoryItemId: string | undefined;
      let pillsConsumed = 0;
      if (dosageMg !== undefined && dosageMg > 0) {
        const inventory = await getActiveInventoryForPrescription(prescriptionId);
        const pills = inventory && calculatePillsConsumed(dosageMg, inventory.strength);
        if (inventory && pills !== undefined) {
          inventoryItemId = inventory.id;
          pillsConsumed = pills;
          const newStock = (inventory.currentStock ?? 0) - pillsConsumed;
          await w.patch("inventoryItems", inventory.id, {
            currentStock: Math.round(newStock * 10000) / 10000,
          });

          const invTxId = crypto.randomUUID();
          await w.insert("inventoryTransactions", {
            id: invTxId,
            inventoryItemId: inventory.id,
            timestamp: Date.now(),
            amount: -pillsConsumed,
            type: "consumed" as const,
            doseLogId,
            createdAt: sf.createdAt,
            updatedAt: sf.updatedAt,
            deletedAt: null,
            deviceId: sf.deviceId,
            timezone: sf.timezone,
          });
        }
      }

      // kind='prn' with NO phase/schedule satisfies the DB
      // dose_logs_kind_fields_check (which only requires phase+schedule for
      // scheduled doses). The client must construct this valid shape because
      // the CHECK is not reflected into the drizzle-zod sync insert schema.
      const doseLog: DoseLog = {
        id: doseLogId,
        prescriptionId,
        kind: "prn",
        scheduledDate: date,
        scheduledTime: time,
        status: "taken",
        actionTimestamp,
        timezone: sf.timezone,
        createdAt: sf.createdAt,
        updatedAt: sf.updatedAt,
        deletedAt: null,
        deviceId: sf.deviceId,
        ...(inventoryItemId !== undefined && { inventoryItemId }),
        ...(doseMg !== undefined && { doseMg }),
        ...(note !== undefined && note.trim() !== "" && { note: note.trim() }),
      };
      await w.insert("doseLogs", doseLog);

      await w.audit("dose_taken", {
        prescriptionId,
        date,
        time,
        kind: "prn",
        doseMg,
        pillsConsumed,
        inventoryItemId,
      });

      return doseLog;
    });

    return ok(log);
  } catch (e) {
    return err("Failed to log PRN dose", e);
  }
}

export interface LogUnlistedDoseInput {
  /** What was taken, as the user named it ("Paracetamol"). */
  medicineName: string;
  /** When it was taken. May not lie in the future. */
  takenAt: number;
  /** How much, in `unit`, when the user said. */
  amount?: number;
  unit?: string;
  note?: string;
}

/**
 * Log a medicine that is not on the user's list (a paracetamol taken once).
 * It is a PRN dose with a name and no prescription: no stock moves and no
 * prescription is created. It shows with the other doses of its day and is
 * undone like any PRN dose (undoPrnDose).
 */
export async function logUnlistedDose(
  input: LogUnlistedDoseInput,
): Promise<ServiceResult<DoseLog>> {
  try {
    const medicineName = input.medicineName.trim();
    if (medicineName === "") return err("Name the medicine");
    if (!Number.isFinite(input.takenAt)) return err("Invalid time");
    if (isFutureTakenAt(input.takenAt)) {
      return err("Cannot record a dose as taken at a future time");
    }
    const note = input.note?.trim();

    const log = await syncedWrite(["doseLogs"], async (w) => {
      const sf = syncFields();
      const doseLog: DoseLog = {
        id: crypto.randomUUID(),
        medicineName,
        kind: "prn",
        scheduledDate: toLocalDateKey(input.takenAt),
        scheduledTime: hhmm(input.takenAt),
        status: "taken",
        actionTimestamp: input.takenAt,
        timezone: sf.timezone,
        createdAt: sf.createdAt,
        updatedAt: sf.updatedAt,
        deletedAt: null,
        deviceId: sf.deviceId,
        ...(input.amount !== undefined && { doseAmount: input.amount }),
        ...(input.amount !== undefined && input.unit !== undefined && { doseUnit: input.unit }),
        ...(input.amount !== undefined && input.unit === "mg" && { doseMg: input.amount }),
        ...(note && { note }),
      };
      await w.insert("doseLogs", doseLog);
      await w.audit("dose_taken", {
        medicineName,
        date: doseLog.scheduledDate,
        time: doseLog.scheduledTime,
        kind: "prn",
        unlisted: true,
      });
      return doseLog;
    });
    return ok(log);
  } catch (e) {
    return err("Failed to log medicine", e);
  }
}

/** "HH:MM" of a timestamp on the device's clock. */
function hhmm(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Reverse a taken dose. Restores the stock the take deducted. */
export async function untakeDose(input: UntakeDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const log = await syncedWrite(DOSE_TABLES, async (w) => (await untakeInTx(w, input)).after);
    return ok(log);
  } catch (e) {
    return err("Failed to untake dose", e);
  }
}

/** Skip a dose. If previously taken, reverses stock adjustment. */
export async function skipDose(input: SkipDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const log = await syncedWrite(DOSE_TABLES, async (w) => (await skipInTx(w, input)).after);
    return ok(log);
  } catch (e) {
    return err(failMessage(e, "Failed to skip dose"), e);
  }
}

/** Reverse a skip: the dose is open again. A dose that is not skipped is left alone. */
export async function unskipDose(input: UnskipDoseInput): Promise<ServiceResult<DoseLog | undefined>> {
  try {
    const log = await syncedWrite(DOSE_TABLES, async (w) => (await unskipInTx(w, input))?.after);
    return ok(log);
  } catch (e) {
    return err("Failed to unskip dose", e);
  }
}

/**
 * Move one occurrence of a dose to a new reminder instant, inside a synced
 * write. The dose keeps its key and its original time; only `remindAt`
 * changes. A taken dose is refused: untake it first (the old silent un-take
 * is gone). A skipped dose is open again, its reason cleared. There is no
 * time limit and a future day is allowed.
 */
async function rescheduleInTx(w: SyncedWriter, input: RescheduleDoseInput): Promise<DoseChange> {
  const { prescriptionId, phaseId, scheduleId, date, time, remindAt } = input;
  if (!Number.isFinite(remindAt)) throw new DoseRuleError("Invalid time");
  const prev = await getDoseLogRaw(scheduleId, date);
  if (prev?.status === "taken") throw new DoseRuleError("Untake the dose first.");
  const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));

  const after = await writeSlotLog(
    w, prev, logId, { prescriptionId, phaseId, scheduleId, date, time }, "rescheduled",
    // The old "HH:MM" override is no longer written; clear it so it cannot
    // come back. A skip reason goes too: the dose is open again.
    { remindAt, rescheduledTo: undefined, skipReason: undefined },
  );
  await w.audit("dose_rescheduled", {
    prescriptionId, date, time, remindAt, previousRemindAt: prev?.remindAt,
  });
  return { key: input, before: prev, after };
}

/**
 * Cancel a reschedule inside a synced write: the dose is due at its
 * original time again. Null when the dose is not rescheduled.
 */
async function cancelRescheduleInTx(
  w: SyncedWriter,
  input: CancelRescheduleInput,
): Promise<DoseChange | null> {
  const { prescriptionId, phaseId, scheduleId, date, time } = input;
  const prev = await getDoseLogRaw(scheduleId, date);
  if (prev?.status !== "rescheduled") return null;
  const after = await writeSlotLog(
    w, prev, prev.id, { prescriptionId, phaseId, scheduleId, date, time }, "pending",
    { remindAt: undefined, rescheduledTo: undefined },
  );
  await w.audit("dose_rescheduled", { prescriptionId, date, time, cancelled: true });
  return { key: input, before: prev, after };
}

/** When a dose is scheduled: its schedule's wall clock on its date in the anchor zone. */
async function scheduledInstantOf(key: DoseKey): Promise<number | null> {
  const schedule = await db.phaseSchedules.get(key.scheduleId);
  if (!schedule) return null;
  try {
    return zonedWallClockToInstant(key.date, schedule.time, schedule.anchorTimezone || getDeviceTimezone());
  } catch {
    return null;
  }
}

/** The next scheduled dose of the same medicine after this one (epoch ms), if any. */
async function nextDoseOf(
  key: DoseKey,
  scheduledAt: number,
  doses: Awaited<ReturnType<typeof readReminderDoses>>,
): Promise<number | null> {
  const same = doses.filter((d) => d.prescriptionId === key.prescriptionId);
  const next = buildReminderOccurrences(same, {
    from: scheduledAt + 1,
    days: 8,
    deviceTz: getDeviceTimezone(),
  }).find((o) => !(o.dose.scheduleId === key.scheduleId && o.dateKey === key.date));
  return next?.at ?? null;
}

/**
 * The warnings for moving these doses to `remindAt`, one list for the sheet
 * and the save: "This time has passed" (once) and, per medicine, "This is
 * after your next dose". Warnings never block a save.
 */
export async function getRescheduleWarnings(
  entries: readonly DoseKey[],
  remindAt: number,
  now: number = Date.now(),
): Promise<DoseRescheduleWarning[]> {
  const out: DoseRescheduleWarning[] = [];
  if (!Number.isFinite(remindAt)) return out;
  // The database on screen: the warning is about the doses the user sees.
  const doses = entries.length > 0 ? await readReminderDoses() : [];
  const seen = new Set<string>();
  let past = false;
  for (const entry of entries) {
    const scheduledAt = await scheduledInstantOf(entry);
    const nextAt = scheduledAt === null ? null : await nextDoseOf(entry, scheduledAt, doses);
    for (const warning of rescheduleWarnings(remindAt, now, nextAt)) {
      if (warning.kind === "past") {
        if (!past) out.unshift({ ...warning, prescriptionId: entry.prescriptionId });
        past = true;
      } else if (!seen.has(entry.prescriptionId)) {
        seen.add(entry.prescriptionId);
        out.push({ ...warning, prescriptionId: entry.prescriptionId });
      }
    }
  }
  return out;
}

/**
 * Reschedule one dose to a new instant. The dose stays under its original
 * time; its reminder moves. Returns the log and the warnings (they never
 * block). A taken dose is refused: "Untake the dose first."
 */
export async function rescheduleDose(
  input: RescheduleDoseInput,
): Promise<ServiceResult<{ log: DoseLog; warnings: DoseRescheduleWarning[] }>> {
  try {
    const warnings = await getRescheduleWarnings([input], input.remindAt);
    const change = await syncedWrite(DOSE_TABLES, (w) => rescheduleInTx(w, input));
    return ok({ log: change.after, warnings });
  } catch (e) {
    return err(failMessage(e, "Failed to reschedule dose"), e);
  }
}

/** Cancel a reschedule: the dose is due at its original time again. */
export async function cancelReschedule(
  input: CancelRescheduleInput,
): Promise<ServiceResult<DoseChange | null>> {
  try {
    return ok(await syncedWrite(DOSE_TABLES, (w) => cancelRescheduleInTx(w, input)));
  } catch (e) {
    return err("Failed to cancel the reschedule", e);
  }
}

// ---------------------------------------------------------------------------
// Bulk dose actions ("Mark all doses")
// ---------------------------------------------------------------------------
//
// One synced write covers every dose, so all of them change or none do.
// Take all and Skip all change only the doses with no user action yet: a
// dose that is already taken or skipped is never overridden. The result
// lists only the doses that changed, with their log before, for undo.

async function runBulk<K extends DoseKey>(
  entries: readonly K[],
  step: (w: SyncedWriter, entry: K) => Promise<DoseChange | null>,
): Promise<ServiceResult<DoseChange<K>[]>> {
  try {
    const changes = await syncedWrite(DOSE_TABLES, async (w) => {
      const out: DoseChange<K>[] = [];
      for (const entry of entries) {
        const change = await step(w, entry);
        if (change) out.push({ ...change, key: entry });
      }
      return out;
    });
    return ok(changes);
  } catch (e) {
    return err(failMessage(e, "Could not save. No dose changed."), e);
  }
}

/** True when the dose's stored log is a final user action (taken or skipped). */
async function isMarked(entry: DoseKey): Promise<boolean> {
  const prev = await getDoseLogRaw(entry.scheduleId, entry.date);
  return prev?.status === "taken" || prev?.status === "skipped";
}

/**
 * Take every dose in `entries` at `takenAt` (default now). Only open doses
 * change; with `onlyOpen: false` a skipped dose is taken too (a single Take
 * on a skipped dose). A taken dose never changes.
 */
export function takeDoses<K extends DoseKey>(
  entries: readonly K[],
  opts: { takenAt?: number; onlyOpen?: boolean } = {},
): Promise<ServiceResult<DoseChange<K>[]>> {
  const onlyOpen = opts.onlyOpen ?? true;
  return runBulk(entries, async (w, entry) => {
    if (onlyOpen && (await isMarked(entry))) return null;
    return takeInTx(w, { ...entry, ...(opts.takenAt !== undefined && { takenAt: opts.takenAt }) });
  });
}

/**
 * Skip every open dose in `entries`, with one reason (or none). With
 * `onlyOpen: false` a taken dose is skipped too and its pills go back.
 */
export function skipDoses<K extends DoseKey>(
  entries: readonly K[],
  opts: { reason?: string; onlyOpen?: boolean } = {},
): Promise<ServiceResult<DoseChange<K>[]>> {
  const onlyOpen = opts.onlyOpen ?? true;
  return runBulk(entries, async (w, entry) => {
    if (onlyOpen && (await isMarked(entry))) return null;
    return skipInTx(w, { ...entry, ...(opts.reason !== undefined && { reason: opts.reason }) });
  });
}

/** Untake every taken dose in `entries`; their pills go back to stock. */
export function untakeDoses<K extends DoseKey>(
  entries: readonly K[],
): Promise<ServiceResult<DoseChange<K>[]>> {
  return runBulk(entries, async (w, entry) => {
    const prev = await getDoseLogRaw(entry.scheduleId, entry.date);
    return prev?.status === "taken" ? untakeInTx(w, entry) : null;
  });
}

/** Unskip every skipped dose in `entries`: open again, reason cleared. */
export function unskipDoses<K extends DoseKey>(
  entries: readonly K[],
): Promise<ServiceResult<DoseChange<K>[]>> {
  return runBulk(entries, (w, entry) => unskipInTx(w, entry));
}

/**
 * Reschedule every open dose in `entries` to one instant ("Reschedule" in
 * the "Mark all doses" modal). A taken or skipped dose never changes. With
 * `onlyOpen: false` a skipped dose moves too (Reschedule on one skipped
 * dose); a taken dose is still refused. One synced write: all doses move or
 * none do.
 */
export async function rescheduleDoses<K extends DoseKey>(
  entries: readonly K[],
  remindAt: number,
  opts: { onlyOpen?: boolean } = {},
): Promise<ServiceResult<{ changes: DoseChange<K>[]; warnings: DoseRescheduleWarning[] }>> {
  const onlyOpen = opts.onlyOpen ?? true;
  const open: K[] = [];
  for (const entry of entries) if (!onlyOpen || !(await isMarked(entry))) open.push(entry);
  let warnings: DoseRescheduleWarning[];
  try {
    warnings = await getRescheduleWarnings(open, remindAt);
  } catch (e) {
    return err("Could not save. No dose changed.", e);
  }
  const res = await runBulk(open, async (w, entry) => {
    // Checked again inside the write: another device may have marked it.
    if (onlyOpen && (await isMarked(entry))) return null;
    return rescheduleInTx(w, { ...entry, remindAt });
  });
  return res.success ? ok({ changes: res.data, warnings }) : res;
}

/**
 * Give skipped doses their reason after the skip was written (the reason
 * sheet opens after the skip). A dose that is no longer skipped is left
 * alone. Returns how many doses got the reason.
 */
export async function setSkipReason(logIds: readonly string[], reason: string): Promise<ServiceResult<number>> {
  try {
    const count = await syncedWrite(["doseLogs"], async (w) => {
      let n = 0;
      for (const id of logIds) {
        const log = await db.doseLogs.get(id);
        if (!log || !isLive(log) || log.status !== "skipped") continue;
        await w.patch("doseLogs", id, { skipReason: reason });
        n++;
      }
      return n;
    });
    return ok(count);
  } catch (e) {
    return err("Failed to save the reason", e);
  }
}

/**
 * Undo: put each changed dose back EXACTLY as it was before the change
 * (status, taken time, skip reason and the stock snapshot). Stock follows
 * the status: undoing a take refunds its pills, undoing an untake debits
 * them again. A dose changed since (another action, another device) is left
 * alone and counted as stale. `updatedAt` is not compared: the sync push ack
 * re-stamps it a few seconds after every write without changing the dose.
 * The skip reason is not compared either: it is set after a skip.
 */
export async function revertDoseChanges(
  changes: readonly DoseChange[],
): Promise<ServiceResult<{ reverted: number; stale: number }>> {
  try {
    const counts = await syncedWrite(DOSE_TABLES, async (w) => {
      let reverted = 0;
      let stale = 0;
      for (const { key, before, after } of changes) {
        const current = await db.doseLogs.get(after.id);
        if (
          !current ||
          !isLive(current) ||
          current.status !== after.status ||
          current.actionTimestamp !== after.actionTimestamp ||
          current.remindAt !== after.remindAt ||
          (current.pillsConsumed ?? 0) !== (after.pillsConsumed ?? 0)
        ) {
          stale++;
          continue;
        }
        if (current.status === "taken") await restoreTakenStock(w, current, key.dosageMg);
        if (before?.status === "taken") await debitTakenStock(w, before, key.dosageMg, current.id);
        await w.patch("doseLogs", current.id, before
          ? {
              status: before.status,
              actionTimestamp: before.actionTimestamp,
              timezone: before.timezone,
              rescheduledTo: before.rescheduledTo,
              remindAt: before.remindAt,
              skipReason: before.skipReason,
              inventoryItemId: before.inventoryItemId,
              pillsConsumed: before.pillsConsumed,
              pillStrength: before.pillStrength,
              doseAmount: before.doseAmount,
              doseUnit: before.doseUnit,
            }
          : {
              // The slot had no log: it goes back to open. The row is kept
              // (a tombstone of a deterministic id never syncs back).
              status: "pending",
              actionTimestamp: w.now,
              skipReason: undefined,
              remindAt: undefined,
              pillsConsumed: 0,
              inventoryItemId: undefined,
            });
        await w.audit(
          before?.status === "taken"
            ? "dose_taken"
            : before?.status === "skipped"
              ? "dose_skipped"
              : before?.status === "rescheduled" || after.status === "rescheduled"
                ? "dose_rescheduled"
                : "dose_untaken",
          { prescriptionId: key.prescriptionId, date: key.date, time: key.time, undo: true },
        );
        reverted++;
      }
      return { reverted, stale };
    });
    return ok(counts);
  } catch (e) {
    return err("Failed to undo", e);
  }
}

/** Rewrite when a taken dose was taken, inside a synced write. */
async function editTimeInTx(w: SyncedWriter, input: EditDoseTimeInput): Promise<DoseLog> {
  const { prescriptionId, scheduleId, date, time, takenAt } = input;
  if (!Number.isFinite(takenAt)) throw new Error("Invalid time");
  const prev = await getDoseLogRaw(scheduleId, date);
  if (!prev || prev.status !== "taken") {
    throw new Error("Dose is not logged as taken");
  }
  const written = await w.patch("doseLogs", prev.id, { actionTimestamp: takenAt });
  await w.audit("dose_time_edited", { prescriptionId, date, time, takenAt });
  return written!;
}

/**
 * Change the recorded time of an already-taken dose. Only `actionTimestamp`
 * changes; stock is untouched since the dose itself is unchanged. Any
 * instant is accepted: the user states when it was taken.
 */
export async function editDoseTime(input: EditDoseTimeInput): Promise<ServiceResult<DoseLog>> {
  try {
    if (!Number.isFinite(input.takenAt)) return err("Invalid time");
    const log = await syncedWrite(["doseLogs"], (w) => editTimeInTx(w, input));
    return ok(log);
  } catch (e) {
    return err("Failed to edit dose time", e);
  }
}

/** One change of a mixed dose write (a voice row): what to do to one dose. */
export type DoseStep =
  | { type: "take"; key: DoseKey; takenAt?: number }
  | { type: "retime"; key: DoseKey; takenAt: number }
  | { type: "skip"; key: DoseKey; reason?: string }
  | { type: "untake"; key: DoseKey };

/**
 * Apply several dose changes of different kinds in ONE synced write: all of
 * them are saved or none is (a voice row that takes some doses and corrects
 * the time of another). Each step acts on its dose as planned; a take of a
 * dose that is already taken changes nothing.
 */
export async function applyDoseSteps(steps: readonly DoseStep[]): Promise<ServiceResult<number>> {
  try {
    const changed = await syncedWrite(DOSE_TABLES, async (w) => {
      let n = 0;
      for (const step of steps) {
        switch (step.type) {
          case "take":
            if (await takeInTx(w, { ...step.key, ...(step.takenAt !== undefined && { takenAt: step.takenAt }) })) n++;
            break;
          case "retime":
            await editTimeInTx(w, { ...step.key, takenAt: step.takenAt });
            n++;
            break;
          case "skip":
            await skipInTx(w, { ...step.key, ...(step.reason !== undefined && { reason: step.reason }) });
            n++;
            break;
          case "untake":
            await untakeInTx(w, step.key);
            n++;
            break;
        }
      }
      return n;
    });
    return ok(changed);
  } catch (e) {
    return err(failMessage(e, "Could not save. No dose changed."), e);
  }
}
