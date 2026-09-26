import { db, type DoseLog, type DoseStatus, type Prescription, type MedicationPhase, type PhaseSchedule, type InventoryItem } from "@/lib/db";
import type { UpdateSpec } from "dexie";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { getDeviceTimezone } from "@/lib/timezone";
import { buildAuditEntry } from "@/lib/audit-service";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import { getActiveInventoryForPrescription } from "@/lib/inventory-service";
import { toLocalDateKey } from "@/lib/date-utils";
import { isLive } from "@intake/core/lifecycle";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoseLogWithDetails {
  log: DoseLog;
  prescription: Prescription;
  phase: MedicationPhase;
  schedule: PhaseSchedule;
  inventory?: InventoryItem;
}

export interface TakeDoseInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  dosageMg: number;
  takenAtTime?: string; // "HH:MM" — user-specified time they actually took the dose
}

export interface UntakeDoseInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  dosageMg: number;
}

export interface SkipDoseInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  dosageMg: number;
  reason?: string;
}

export interface RescheduleDoseInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  newTime: string;
  dosageMg: number;
}

export interface EditDoseTimeInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  newTime: string; // "HH:MM" — actual time the dose was taken
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
 * Uses 4-decimal rounding to avoid floating-point noise.
 */
export function calculatePillsConsumed(doseMg: number, pillStrengthMg: number): number {
  if (pillStrengthMg === 0) return 0;
  const raw = doseMg / pillStrengthMg;
  return Math.round(raw * 10000) / 10000;
}

/**
 * Check whether a fractional pill amount is a "clean" fraction.
 * Clean fractions: whole numbers, 0.25, 0.333, 0.5, 0.667, 0.75
 * Uses 0.01 tolerance for floating-point comparison.
 */
export function isCleanFraction(pillsConsumed: number): boolean {
  const frac = Math.abs(pillsConsumed % 1);
  if (frac < 0.01) return true; // whole number
  const cleanFractions = [0.25, 0.333, 0.5, 0.667, 0.75];
  return cleanFractions.some(cf => Math.abs(frac - cf) < 0.01);
}

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

const SLOT_LOG_RANK: Record<DoseStatus, number> = {
  taken: 3,
  skipped: 2,
  rescheduled: 1,
  pending: 0,
};

/**
 * Pick THE log for one dose slot out of every log stored for it. Older builds
 * (and two offline devices) could leave several live logs for one slot, so the
 * choice must not depend on IndexedDB iteration order: the strongest status
 * wins, then the newest write, then the larger id.
 */
export function selectSlotLog(logs: readonly DoseLog[]): DoseLog | undefined {
  let best: DoseLog | undefined;
  for (const log of logs) {
    if (!isLive(log) || log.kind === "prn") continue;
    if (!best) {
      best = log;
      continue;
    }
    const byRank = SLOT_LOG_RANK[log.status] - SLOT_LOG_RANK[best.status];
    if (
      byRank > 0 ||
      (byRank === 0 && log.updatedAt > best.updatedAt) ||
      (byRank === 0 && log.updatedAt === best.updatedAt && log.id > best.id)
    ) {
      best = log;
    }
  }
  return best;
}

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
  | "rescheduledTo" | "skipReason" | "note" | "inventoryItemId" | "actionTimestamp"
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
 * Used inside transactions. A patch key set to `undefined` clears the field.
 */
async function writeSlotLog(
  prev: DoseLog | undefined,
  id: string,
  slot: SlotRef,
  status: DoseStatus,
  patch: DoseLogPatch = {},
): Promise<DoseLog> {
  const now = Date.now();

  if (prev) {
    const updates = {
      status,
      actionTimestamp: now,
      timezone: getDeviceTimezone(),
      updatedAt: now,
      ...patch,
    };
    // Dexie deletes a key whose update value is `undefined`.
    await db.doseLogs.update(prev.id, updates as UpdateSpec<DoseLog>);
    const next: Record<string, unknown> = { ...prev, ...updates };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
    }
    return next as unknown as DoseLog;
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
  await db.doseLogs.add(log);
  return log;
}

/**
 * Put back the stock a taken dose deducted. Reverses the pills recorded on the
 * log at take time; only legacy logs without that snapshot fall back to the
 * caller's current dose and the item's current strength. Returns the pills
 * restored. Used inside transactions.
 */
async function restoreTakenStock(prev: DoseLog | undefined, dosageMg: number): Promise<number> {
  if (prev?.status !== "taken" || !prev.inventoryItemId) return 0;
  const inventory = await db.inventoryItems.get(prev.inventoryItemId);
  if (!inventory) return 0;

  const pills = prev.pillsConsumed ?? calculatePillsConsumed(dosageMg, inventory.strength);
  if (!(pills > 0)) return 0;

  const newStock = (inventory.currentStock ?? 0) + pills;
  await db.inventoryItems.update(inventory.id, {
    currentStock: Math.round(newStock * 10000) / 10000,
    updatedAt: Date.now(),
  });
  await enqueueInsideTx("inventoryItems", inventory.id, "upsert");

  const sf = syncFields();
  const invTxId = crypto.randomUUID();
  await db.inventoryTransactions.add({
    id: invTxId,
    inventoryItemId: inventory.id,
    timestamp: Date.now(),
    amount: pills,
    type: "consumed",
    doseLogId: prev.id,
    createdAt: sf.createdAt,
    updatedAt: sf.updatedAt,
    deletedAt: null,
    deviceId: sf.deviceId,
    timezone: sf.timezone,
  });
  await enqueueInsideTx("inventoryTransactions", invTxId, "upsert");
  return pills;
}

const HHMM = /^(\d{1,2}):(\d{2})$/;

function parseHHMM(value: string): { h: number; m: number } | undefined {
  const match = HHMM.exec(value);
  const h = match ? Number(match[1]) : NaN;
  const m = match ? Number(match[2]) : NaN;
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return undefined;
  }
  return { h, m };
}

function localTimestamp(date: string, h: number, m: number, addDays = 0): number {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + addDays);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

/**
 * Turn the "taken at" wall-clock time the user picked into a timestamp. The
 * picker only asks for a time, so a late dose taken after midnight (the 22:00
 * dose taken at 00:30) belongs to the day after the scheduled date: when the
 * time lands more than 12h before the slot, it rolls to the next day unless
 * that would be in the future. Returns undefined for a malformed time.
 */
export function resolveTakenAt(
  date: string,
  scheduledTime: string,
  takenAtTime: string,
  now: number = Date.now(),
): number | undefined {
  const taken = parseHHMM(takenAtTime);
  if (!taken) return undefined;
  const sameDay = localTimestamp(date, taken.h, taken.m);
  const scheduled = parseHHMM(scheduledTime);
  if (!scheduled) return sameDay;

  const slotAt = localTimestamp(date, scheduled.h, scheduled.m);
  if (slotAt - sameDay > HALF_DAY_MS) {
    const nextDay = localTimestamp(date, taken.h, taken.m, 1);
    if (nextDay <= now) return nextDay;
  }
  return sameDay;
}

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

export async function getDoseLogsWithDetailsForDate(date: string): Promise<DoseLogWithDetails[]> {
  const allLogs = await db.doseLogs.where("scheduledDate").equals(date).toArray();
  const logs = allLogs.filter(isLive);

  const activePrescriptions = await db.prescriptions.toArray();
  const prescriptionMap = new Map(activePrescriptions.map(p => [p.id, p]));

  const phases = await db.medicationPhases.toArray();
  const phaseMap = new Map(phases.map(p => [p.id, p]));

  const schedules = await db.phaseSchedules.toArray();
  const scheduleMap = new Map(schedules.map(s => [s.id, s]));

  const inventories = await db.inventoryItems.toArray();
  const inventoryMap = new Map<string, InventoryItem>();
  for (const inv of inventories) {
    if (inv.isActive && !inv.isArchived) {
      inventoryMap.set(inv.prescriptionId, inv);
    }
  }

  const result: DoseLogWithDetails[] = [];
  for (const log of logs) {
    const prescription = prescriptionMap.get(log.prescriptionId);
    // phaseId/scheduleId are absent for PRN doses — those fall through the
    // `prescription && phase && schedule` guard below and are excluded here.
    const phase = log.phaseId ? phaseMap.get(log.phaseId) : undefined;
    const schedule = log.scheduleId ? scheduleMap.get(log.scheduleId) : undefined;
    const inventory = inventoryMap.get(log.prescriptionId);

    if (prescription && phase && schedule) {
      result.push({
        log,
        prescription,
        phase,
        schedule,
        ...(inventory !== undefined && { inventory }),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Mutation functions — atomic transactions with audit logging
// ---------------------------------------------------------------------------

/**
 * Record a dose as taken. Atomic: dose log + stock decrement + audit log in
 * a single Dexie transaction. Fractional pill math uses dosageMg / pillStrength.
 */
export async function takeDose(input: TakeDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, phaseId, scheduleId, date, time, dosageMg, takenAtTime } = input;

    // A dose cannot be taken ahead of its day; it would debit stock for a
    // pill that is still in the bottle.
    if (date > toLocalDateKey()) {
      return err("Cannot take a dose scheduled for a future date");
    }

    // Convert user-specified taken time to a timestamp if provided
    let actionTimestampOverride: number | undefined;
    if (takenAtTime) {
      actionTimestampOverride = resolveTakenAt(date, time, takenAtTime);
      if (actionTimestampOverride === undefined) {
        return err(`Invalid time "${takenAtTime}"`);
      }
    }

    const log = await db.transaction(
      "rw",
      [
        db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.medicationPhases,
        db.phaseSchedules, db.auditLogs, db._syncQueue,
      ],
      async () => {
        const prev = await getDoseLogRaw(scheduleId, date);
        // Resolve the log id first so the consumed transaction can link to it.
        const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));
        const wasTaken = prev?.status === "taken";

        let inventoryItemId: string | undefined = prev?.inventoryItemId;
        let pillsConsumed = 0;
        const patch: DoseLogPatch = {};

        if (!wasTaken) {
          // Find active inventory for this prescription. `isActive` is a
          // boolean and IndexedDB cannot index booleans, so a
          // `.where({ isActive: 1 })` equality match never hits — the shared
          // helper filters in memory the same way every other call site does.
          const inventory = await getActiveInventoryForPrescription(prescriptionId);

          // Snapshot what is being taken, so later schedule or inventory edits
          // cannot rewrite this dose. The item id is only the one debited now:
          // a stale id from an earlier take would let the next undo restore
          // pills that were never taken out.
          const [phase, schedule] = await Promise.all([
            db.medicationPhases.get(phaseId),
            db.phaseSchedules.get(scheduleId),
          ]);
          patch.doseAmount = dosageMg;
          patch.doseUnit = schedule?.unit ?? phase?.unit;
          inventoryItemId = inventory?.id;
          patch.inventoryItemId = inventoryItemId;
          patch.pillsConsumed = 0;
          patch.pillStrength = inventory?.strength;

          if (inventory) {
            pillsConsumed = calculatePillsConsumed(dosageMg, inventory.strength);
            patch.pillsConsumed = pillsConsumed;
            const newStock = (inventory.currentStock ?? 0) - pillsConsumed;

            // Update stock (negative allowed per user decision)
            await db.inventoryItems.update(inventory.id, {
              currentStock: Math.round(newStock * 10000) / 10000,
              updatedAt: Date.now(),
            });
            await enqueueInsideTx("inventoryItems", inventory.id, "upsert");

            // Record inventory transaction
            const sf = syncFields();
            const invTxId = crypto.randomUUID();
            await db.inventoryTransactions.add({
              id: invTxId,
              inventoryItemId: inventory.id,
              timestamp: Date.now(),
              amount: -pillsConsumed,
              type: "consumed" as const,
              doseLogId: logId,
              createdAt: sf.createdAt,
              updatedAt: sf.updatedAt,
              deletedAt: null,
              deviceId: sf.deviceId,
              timezone: sf.timezone,
            });
            await enqueueInsideTx("inventoryTransactions", invTxId, "upsert");
          }
        }

        if (actionTimestampOverride !== undefined) patch.actionTimestamp = actionTimestampOverride;

        // Upsert dose log
        const doseLog = await writeSlotLog(
          prev, logId, { prescriptionId, phaseId, scheduleId, date, time }, "taken", patch,
        );
        await enqueueInsideTx("doseLogs", doseLog.id, "upsert");

        // Audit log
        const auditDetails: Record<string, unknown> = {
          prescriptionId, date, time, dosageMg, pillsConsumed, inventoryItemId,
        };
        if (pillsConsumed > 0 && !isCleanFraction(pillsConsumed)) {
          auditDetails.warning = "odd_fraction";
        }
        const auditEntry = buildAuditEntry("dose_taken", auditDetails);
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");

        return doseLog;
      },
    );
    schedulePush();

    return ok(log);
  } catch (e) {
    return err("Failed to take dose", e);
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

    const log = await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs, db._syncQueue],
      async () => {
        const sf = syncFields();
        const doseLogId = crypto.randomUUID();

        let inventoryItemId: string | undefined;
        let pillsConsumed = 0;
        if (dosageMg !== undefined && dosageMg > 0) {
          const inventory = await getActiveInventoryForPrescription(prescriptionId);
          if (inventory) {
            inventoryItemId = inventory.id;
            pillsConsumed = calculatePillsConsumed(dosageMg, inventory.strength);
            const newStock = (inventory.currentStock ?? 0) - pillsConsumed;
            await db.inventoryItems.update(inventory.id, {
              currentStock: Math.round(newStock * 10000) / 10000,
              updatedAt: Date.now(),
            });
            await enqueueInsideTx("inventoryItems", inventory.id, "upsert");

            const invTxId = crypto.randomUUID();
            await db.inventoryTransactions.add({
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
            await enqueueInsideTx("inventoryTransactions", invTxId, "upsert");
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
        await db.doseLogs.add(doseLog);
        await enqueueInsideTx("doseLogs", doseLogId, "upsert");

        const auditEntry = buildAuditEntry("dose_taken", {
          prescriptionId,
          date,
          time,
          kind: "prn",
          doseMg,
          pillsConsumed,
          inventoryItemId,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");

        return doseLog;
      },
    );
    schedulePush();

    return ok(log);
  } catch (e) {
    return err("Failed to log PRN dose", e);
  }
}

/**
 * Reverse a taken dose. Restores the stock the take deducted. The log goes
 * back to the state it had before the take: "rescheduled" if it carries a
 * reschedule override, else "pending", which the schedule view reads by date
 * (pending today, missed on a past day). The log is not soft-deleted: its id
 * is deterministic and the server never resurrects a tombstone, so a later
 * re-take of the same slot could not sync.
 */
export async function untakeDose(input: UntakeDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, phaseId, scheduleId, date, time, dosageMg } = input;

    const log = await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs, db._syncQueue],
      async () => {
        const prev = await getDoseLogRaw(scheduleId, date);
        const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));
        const pillsConsumed = await restoreTakenStock(prev, dosageMg);

        const doseLog = await writeSlotLog(
          prev, logId, { prescriptionId, phaseId, scheduleId, date, time },
          prev?.rescheduledTo ? "rescheduled" : "pending",
          { pillsConsumed: 0 },
        );
        await enqueueInsideTx("doseLogs", doseLog.id, "upsert");

        const auditEntry = buildAuditEntry("dose_untaken", {
          prescriptionId, date, time, dosageMg, pillsConsumed,
          inventoryItemId: prev?.inventoryItemId,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");

        return doseLog;
      },
    );
    schedulePush();

    return ok(log);
  } catch (e) {
    return err("Failed to untake dose", e);
  }
}

/**
 * Skip a dose. If previously taken, reverses stock adjustment.
 */
export async function skipDose(input: SkipDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, phaseId, scheduleId, date, time, dosageMg, reason } = input;

    const log = await db.transaction(
      "rw",
      [
        db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.medicationPhases,
        db.phaseSchedules, db.auditLogs, db._syncQueue,
      ],
      async () => {
        const prev = await getDoseLogRaw(scheduleId, date);
        const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));

        // Reverse stock if previously taken
        const pillsConsumed = await restoreTakenStock(prev, dosageMg);

        // Snapshot the dose that was skipped.
        const [phase, schedule] = await Promise.all([
          db.medicationPhases.get(phaseId),
          db.phaseSchedules.get(scheduleId),
        ]);
        const patch: DoseLogPatch = {
          doseAmount: dosageMg,
          doseUnit: schedule?.unit ?? phase?.unit,
          pillsConsumed: 0,
        };
        if (reason !== undefined) patch.skipReason = reason;

        const doseLog = await writeSlotLog(
          prev, logId, { prescriptionId, phaseId, scheduleId, date, time }, "skipped", patch,
        );
        await enqueueInsideTx("doseLogs", doseLog.id, "upsert");

        const auditEntry = buildAuditEntry("dose_skipped", {
          prescriptionId, date, time, dosageMg, pillsConsumed, reason,
          inventoryItemId: prev?.inventoryItemId,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");

        return doseLog;
      },
    );
    schedulePush();

    return ok(log);
  } catch (e) {
    return err("Failed to skip dose", e);
  }
}

/**
 * Reschedule a dose to a new time. If previously taken, reverses its stock.
 * The slot keeps ONE log, marked "rescheduled" with `rescheduledTo` as the
 * time override; the schedule view builds the slot at that time. (Writing a
 * second "pending" log at the new time left two logs fighting over the slot.)
 */
export async function rescheduleDose(input: RescheduleDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, phaseId, scheduleId, date, time, newTime, dosageMg } = input;

    const log = await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs, db._syncQueue],
      async () => {
        const prev = await getDoseLogRaw(scheduleId, date);
        const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));

        // Reverse stock if previously taken
        const pillsConsumed = await restoreTakenStock(prev, dosageMg);

        const doseLog = await writeSlotLog(
          prev, logId, { prescriptionId, phaseId, scheduleId, date, time }, "rescheduled",
          { rescheduledTo: newTime, pillsConsumed: 0 },
        );
        await enqueueInsideTx("doseLogs", doseLog.id, "upsert");

        const auditEntry = buildAuditEntry("dose_rescheduled", {
          prescriptionId, date, time, newTime, dosageMg, pillsConsumed,
          inventoryItemId: prev?.inventoryItemId,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");

        return doseLog;
      },
    );
    schedulePush();

    return ok(log);
  } catch (e) {
    return err("Failed to reschedule dose", e);
  }
}

/**
 * Take all doses in a list. Each dose gets its own transaction —
 * one failure does not block others.
 */
export async function takeAllDoses(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageMg: number }[],
  date: string,
  time: string,
  takenAtTime?: string,
): Promise<ServiceResult<void>> {
  const errors: string[] = [];

  for (const entry of entries) {
    const result = await takeDose({
      prescriptionId: entry.prescriptionId,
      phaseId: entry.phaseId,
      scheduleId: entry.scheduleId,
      date,
      time,
      dosageMg: entry.dosageMg,
      ...(takenAtTime ? { takenAtTime } : {}),
    });
    if (!result.success) {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(`Failed to take ${errors.length} dose(s): ${errors.join("; ")}`);
  }
  return ok(undefined);
}

/**
 * Skip all doses in a list. Each dose gets its own transaction —
 * one failure does not block others.
 */
export async function skipAllDoses(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageMg: number }[],
  date: string,
  time: string,
  reason?: string,
): Promise<ServiceResult<void>> {
  const errors: string[] = [];

  for (const entry of entries) {
    const result = await skipDose({
      prescriptionId: entry.prescriptionId,
      phaseId: entry.phaseId,
      scheduleId: entry.scheduleId,
      date,
      time,
      dosageMg: entry.dosageMg,
      ...(reason !== undefined && { reason }),
    });
    if (!result.success) {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(`Failed to skip ${errors.length} dose(s): ${errors.join("; ")}`);
  }
  return ok(undefined);
}

/**
 * Edit the recorded time of an already-taken dose. Only `actionTimestamp` is
 * updated — inventory is untouched since the dose itself is unchanged.
 */
export async function editDoseTime(input: EditDoseTimeInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, scheduleId, date, time, newTime } = input;

    const newTimestamp = resolveTakenAt(date, time, newTime);
    if (newTimestamp === undefined) {
      return err(`Invalid time "${newTime}"`);
    }

    const log = await db.transaction(
      "rw",
      [db.doseLogs, db.auditLogs, db._syncQueue],
      async () => {
        const prev = await getDoseLogRaw(scheduleId, date);
        if (!prev || prev.status !== "taken") {
          throw new Error("Dose is not logged as taken");
        }

        const now = Date.now();
        await db.doseLogs.update(prev.id, { actionTimestamp: newTimestamp, updatedAt: now });
        await enqueueInsideTx("doseLogs", prev.id, "upsert");

        const auditEntry = buildAuditEntry("dose_time_edited", {
          prescriptionId, date, time, newTime,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");

        return { ...prev, actionTimestamp: newTimestamp, updatedAt: now };
      },
    );
    schedulePush();

    return ok(log);
  } catch (e) {
    return err("Failed to edit dose time", e);
  }
}

/**
 * Edit the recorded time for a list of taken doses. Each dose gets its own
 * transaction — one failure does not block others.
 */
export async function editAllDoseTimes(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string }[],
  date: string,
  time: string,
  newTime: string,
): Promise<ServiceResult<void>> {
  const errors: string[] = [];

  for (const entry of entries) {
    const result = await editDoseTime({ ...entry, date, time, newTime });
    if (!result.success) {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(`Failed to edit ${errors.length} dose(s): ${errors.join("; ")}`);
  }
  return ok(undefined);
}
