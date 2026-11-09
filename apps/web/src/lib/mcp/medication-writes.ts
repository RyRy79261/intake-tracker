/**
 * Drizzle writes that back the MCP medication tools (log_dose,
 * log_extra_medicine, refill_stock).
 *
 * They do on the server mirror what the app's voice log does on the device
 * for medicines (lib/voice-medication.ts `saveMedicationPlan`): mark a
 * scheduled dose taken, skipped or not taken, log a dose outside the
 * schedule, add pills to stock. Like voice, they never add a prescription,
 * a schedule or a stock item.
 *
 * Every row is the row the app itself would write (ported from
 * lib/dose-log-service.ts, lib/inventory-service.ts and
 * lib/dose-action-service.ts), so the device reads it as its own after its
 * next pull: the deterministic scheduled-dose id, the dose snapshot
 * (doseAmount, doseUnit, pillsConsumed, pillStrength, inventoryItemId), the
 * consumed/refill inventory transaction, the cached `currentStock`, and the
 * synced audit-log row (`w.audit`). Each row is user-scoped, carries
 * deviceId MCP_DEVICE_ID and a fresh serverUpdatedAt, and the statements of
 * one action run atomically.
 *
 * Reads happen before the write batch (the Neon HTTP driver has no
 * interactive transaction), as in lib/mcp/writes.ts.
 *
 * A refusal the model should see (not found, not on the regimen, a future
 * day) is returned as data with a `message`, never thrown: the tool runtime
 * masks a throw as a generic error.
 */
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@intake/db/client";
import {
  auditLogs,
  doseLogs,
  inventoryItems,
  inventoryTransactions,
  medicationPhases,
  phaseSchedules,
  prescriptions,
} from "@intake/db/schema";
import type { AuditAction } from "@intake/types/records";
import { selectEffectivePhases } from "@intake/core/effective-phase";
import { isCleanFraction, isValidPillStrength } from "@intake/core/compound";
import { reopenedStatus } from "@intake/core/dose-rules";
import { resolveScheduleLocalTime } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/mcp/queries";
import { MCP_DEVICE_ID } from "@/lib/mcp/writes";

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export interface Refusal {
  ok: false;
  reason:
    | "not_found"
    | "not_in_regimen"
    | "future_day"
    | "future_time"
    | "nothing_to_undo"
    | "no_stock_item"
    | "ambiguous_medicine"
    | "invalid";
  message: string;
}

export interface StockChange {
  inventory_item_id: string;
  /** Signed pills: negative when pills were taken out. */
  change: number;
  /** Stock after the write, derived as get_inventory_status derives it. */
  stock_after: number;
}

export interface LogDoseInput {
  scheduleId: string;
  /** "YYYY-MM-DD": the local date of the slot. */
  date: string;
  action: "taken" | "skipped" | "not_taken";
  takenAt?: number | undefined;
  skipReason?: string | undefined;
  timezone?: string | undefined;
}

export type LogDoseResult =
  | {
      ok: true;
      dose_log_id: string;
      prescription_id: string;
      prescription_name: string;
      schedule_id: string;
      date: string;
      time: string;
      status: string;
      /** False when the dose already was in the asked state (nothing written). */
      changed: boolean;
      taken_at?: number;
      pills_consumed: number;
      stock: StockChange | null;
    }
  | Refusal;

export interface LogExtraMedicineInput {
  /** A medicine on the list (from list_medications). */
  prescriptionId?: string | undefined;
  /** The medicine's name, for one not on the list. */
  medicineName?: string | undefined;
  amount?: number | undefined;
  unit?: string | undefined;
  takenAt?: number | undefined;
  note?: string | undefined;
  timezone?: string | undefined;
}

export type LogExtraMedicineResult =
  | {
      ok: true;
      dose_log_id: string;
      listed: boolean;
      prescription_id: string | null;
      medicine_name: string;
      date: string;
      time: string;
      taken_at: number;
      pills_consumed: number;
      stock: StockChange | null;
    }
  | Refusal;

export interface RefillStockInput {
  prescriptionId: string;
  pills: number;
}

export type RefillStockResult =
  | {
      ok: true;
      transaction_id: string;
      prescription_id: string;
      prescription_name: string;
      inventory_item_id: string;
      brand_name: string;
      pills_added: number;
      stock_after: number;
    }
  | Refusal;

export type MedicationDeleteResult =
  | { deleted: true; kind: "extra_medicine" | "stock_refill"; id: string; stock: StockChange | null }
  | { deleted: false; reason: "not_found" | "not_connector_entry" };

function refuse(reason: Refusal["reason"], message: string): Refusal {
  return { ok: false, reason, message };
}

// ---------------------------------------------------------------------------
// Pure helpers copied from the app (they may not move to packages/core here)
// ---------------------------------------------------------------------------

/** Copied from lib/dose-log-service.ts `calculatePillsConsumed`. */
function calculatePillsConsumed(doseMg: number, pillStrengthMg: number): number | undefined {
  if (!isValidPillStrength(pillStrengthMg)) return undefined;
  return Math.round((doseMg / pillStrengthMg) * 10000) / 10000;
}

function roundStock(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** cyrb128, copied from lib/dose-log-service.ts. */
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
 * Copied from lib/dose-log-service.ts `scheduledDoseLogId`: the id two
 * devices (and the connector) give the same slot, so the server's
 * last-write-wins merge keeps one row.
 */
export function scheduledDoseLogId(scheduleId: string, date: string): string {
  const hex = cyrb128(`${scheduleId}|${date}`)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type DoseLogRow = typeof doseLogs.$inferSelect;

const SLOT_LOG_RANK: Record<string, number> = { taken: 3, skipped: 2, rescheduled: 1, pending: 0 };

/** Copied from lib/dose-log-read.ts `selectSlotLog`: THE log of one slot. */
function selectSlotLog(logs: readonly DoseLogRow[]): DoseLogRow | undefined {
  let best: DoseLogRow | undefined;
  for (const log of logs) {
    if (log.deletedAt != null || log.kind === "prn") continue;
    if (!best) {
      best = log;
      continue;
    }
    const byRank = (SLOT_LOG_RANK[log.status] ?? 0) - (SLOT_LOG_RANK[best.status] ?? 0);
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

/** Copied from lib/voice-medication.ts `norm`: names compared without case, spaces or marks. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/** Slack for a "taken at" time, as lib/dose-log-service.ts `isFutureTakenAt`. */
const FUTURE_TAKEN_AT_GRACE_MS = 60 * 1000;

function dateKeyIn(timestamp: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

function hhmmIn(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

type Executor = Pick<typeof db, "insert" | "update">;
type Query = Parameters<typeof db.batch>[0][number];

/**
 * Copied from lib/mcp/writes.ts `runAtomically`: a batch on the Neon HTTP
 * driver (one implicit transaction), a transaction on a pooled driver.
 */
async function runAtomically(build: (exec: Executor) => Query[]): Promise<void> {
  const client = db as unknown as {
    batch?: (queries: Query[]) => Promise<unknown>;
    transaction: (fn: (tx: Executor) => Promise<void>) => Promise<void>;
  };
  if (typeof client.batch === "function") {
    const queries = build(db);
    if (queries.length > 0) await client.batch(queries);
    return;
  }
  await client.transaction(async (tx) => {
    for (const q of build(tx)) await q;
  });
}

/** One write of an action, built later against the executor that runs it. */
type Step = (exec: Executor) => Query;

/** The sync columns a new connector row carries. */
function newRowFields(userId: string, timezone: string, now: number) {
  return {
    userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: MCP_DEVICE_ID,
    timezone,
    serverUpdatedAt: now,
  };
}

/** The synced audit-log row the app's `w.audit` writes (lib/synced-write.ts). */
function auditStep(
  userId: string,
  timezone: string,
  now: number,
  action: AuditAction,
  details: Record<string, unknown>,
): Step {
  return (exec) =>
    exec.insert(auditLogs).values({
      id: crypto.randomUUID(),
      timestamp: now,
      action,
      // JSON.stringify drops undefined keys, as on the device.
      details: JSON.stringify(details),
      ...newRowFields(userId, timezone, now),
    });
}

/** Postgres has no "absent": an explicit undefined clears the column. */
function nullify<T extends Record<string, unknown>>(patch: T): { [K in keyof T]: Exclude<T[K], undefined> | null } {
  return Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]),
  ) as { [K in keyof T]: Exclude<T[K], undefined> | null };
}

type InventoryRow = typeof inventoryItems.$inferSelect;

/**
 * Patch an item's cached stock, as the app's dose paths do
 * (`currentStock + pills`, lib/dose-log-service.ts `moveStock`).
 */
function cachedStockStep(userId: string, item: InventoryRow, pills: number, now: number): Step {
  return (exec) =>
    exec
      .update(inventoryItems)
      .set({
        currentStock: roundStock((item.currentStock ?? 0) + pills),
        updatedAt: now,
        serverUpdatedAt: now,
      })
      .where(and(eq(inventoryItems.id, item.id), eq(inventoryItems.userId, userId)));
}

/** A consumed transaction linked to a dose log (lib/dose-log-service.ts `moveStock`). */
function consumedTxStep(
  userId: string,
  timezone: string,
  now: number,
  inventoryItemId: string,
  amount: number,
  doseLogId: string,
): Step {
  return (exec) =>
    exec.insert(inventoryTransactions).values({
      id: crypto.randomUUID(),
      inventoryItemId,
      timestamp: now,
      amount,
      type: "consumed",
      doseLogId,
      ...newRowFields(userId, timezone, now),
    });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Stock as get_inventory_status derives it: the signed sum of the item's
 * live transactions, else the legacy cached value, else 0.
 */
async function derivedStock(userId: string, inventoryItemId: string): Promise<number> {
  const rows = await db
    .select({
      stock: sql<number>`COALESCE(
        (SELECT ROUND(SUM(${inventoryTransactions.amount}::double precision)::numeric, 4)::double precision
           FROM ${inventoryTransactions}
          WHERE ${inventoryTransactions.inventoryItemId} = ${inventoryItems.id}
            AND ${inventoryTransactions.userId} = ${userId}
            AND ${inventoryTransactions.deletedAt} IS NULL),
        ${inventoryItems.currentStock}::double precision,
        0
      )`.mapWith(Number),
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, inventoryItemId), eq(inventoryItems.userId, userId)));
  return rows[0]?.stock ?? 0;
}

/** The user's live, non-archived stock items of a prescription, oldest id first. */
async function brandsOf(userId: string, prescriptionId: string): Promise<InventoryRow[]> {
  return db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.userId, userId),
        eq(inventoryItems.prescriptionId, prescriptionId),
        isNull(inventoryItems.deletedAt),
        or(isNull(inventoryItems.isArchived), eq(inventoryItems.isArchived, false)),
      ),
    )
    .orderBy(asc(inventoryItems.id));
}

/**
 * The brand doses are deducted from (lib/inventory-service.ts
 * `isActiveBrand`): live, active, not archived.
 */
function activeOf(brands: InventoryRow[]): InventoryRow | undefined {
  return brands.find((b) => b.isActive === true);
}

/**
 * The brand voice plans with (lib/voice-medication.ts `activeBrand`): the
 * active one, else the only one.
 */
function voiceBrandOf(brands: InventoryRow[]): InventoryRow | undefined {
  return activeOf(brands) ?? (brands.length === 1 ? brands[0] : undefined);
}

/** An item by id, live or not, as Dexie's `get` reads it. */
async function itemById(userId: string, id: string): Promise<InventoryRow | undefined> {
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.userId, userId)));
  return rows[0];
}

async function livePrescription(userId: string, prescriptionId: string) {
  const rows = await db
    .select({
      id: prescriptions.id,
      genericName: prescriptions.genericName,
      isActive: prescriptions.isActive,
    })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.userId, userId),
        eq(prescriptions.id, prescriptionId),
        isNull(prescriptions.deletedAt),
      ),
    );
  const p = rows[0];
  return p?.isActive ? p : undefined;
}

/**
 * The slot of `scheduleId` on `date` in the user's effective regimen: the
 * selection get_today_summary makes (lib/mcp/queries.ts
 * `loadEffectiveRegimen` + `getDoseDay`, which are not exported): active
 * prescription, its effective phase, a live enabled schedule in effect on
 * the date, the date's weekday, and not before the prescription existed.
 */
async function resolveSlot(userId: string, scheduleId: string, date: string, timezone: string) {
  const own = await db
    .select({ phaseId: phaseSchedules.phaseId })
    .from(phaseSchedules)
    .where(
      and(
        eq(phaseSchedules.userId, userId),
        eq(phaseSchedules.id, scheduleId),
        isNull(phaseSchedules.deletedAt),
      ),
    );
  if (own.length === 0) return { found: false as const };

  const ownPhase = await db
    .select({ prescriptionId: medicationPhases.prescriptionId })
    .from(medicationPhases)
    .where(and(eq(medicationPhases.userId, userId), eq(medicationPhases.id, own[0]!.phaseId)));
  const prescriptionId = ownPhase[0]?.prescriptionId;
  if (!prescriptionId) return { found: false as const };

  const presc = await db
    .select({
      id: prescriptions.id,
      genericName: prescriptions.genericName,
      createdAt: prescriptions.createdAt,
    })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.userId, userId),
        eq(prescriptions.id, prescriptionId),
        eq(prescriptions.isActive, true),
        isNull(prescriptions.deletedAt),
      ),
    );
  const p = presc[0];
  if (!p) return { found: true as const, slot: undefined };

  const phases = await db
    .select({
      id: medicationPhases.id,
      prescriptionId: medicationPhases.prescriptionId,
      type: medicationPhases.type,
      titrationPlanId: medicationPhases.titrationPlanId,
      unit: medicationPhases.unit,
      startDate: medicationPhases.startDate,
      endDate: medicationPhases.endDate,
      status: medicationPhases.status,
      deletedAt: medicationPhases.deletedAt,
    })
    .from(medicationPhases)
    .where(
      and(
        eq(medicationPhases.userId, userId),
        eq(medicationPhases.status, "active"),
        eq(medicationPhases.prescriptionId, prescriptionId),
        isNull(medicationPhases.deletedAt),
      ),
    )
    .orderBy(asc(medicationPhases.startDate), asc(medicationPhases.id));
  const schedules =
    phases.length === 0
      ? []
      : await db
          .select({
            id: phaseSchedules.id,
            phaseId: phaseSchedules.phaseId,
            time: phaseSchedules.time,
            scheduleTimeUTC: phaseSchedules.scheduleTimeUTC,
            anchorTimezone: phaseSchedules.anchorTimezone,
            dosage: phaseSchedules.dosage,
            unit: phaseSchedules.unit,
            daysOfWeek: phaseSchedules.daysOfWeek,
            enabled: phaseSchedules.enabled,
            effectiveFrom: phaseSchedules.effectiveFrom,
            effectiveTo: phaseSchedules.effectiveTo,
            deletedAt: phaseSchedules.deletedAt,
          })
          .from(phaseSchedules)
          .where(
            and(
              eq(phaseSchedules.userId, userId),
              eq(phaseSchedules.enabled, true),
              inArray(phaseSchedules.phaseId, phases.map((ph) => ph.id)),
              isNull(phaseSchedules.deletedAt),
            ),
          )
          .orderBy(asc(phaseSchedules.time), asc(phaseSchedules.id));

  const effective = selectEffectivePhases(phases, schedules, { onDate: date });
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  for (const { phase, schedules: live } of effective) {
    const sched = live.find((s) => s.id === scheduleId);
    if (!sched) continue;
    if (!sched.daysOfWeek.includes(weekday)) continue;
    if (dateKeyIn(p.createdAt, timezone) > date) continue;
    return {
      found: true as const,
      slot: {
        prescriptionId,
        prescriptionName: p.genericName,
        phaseId: phase.id,
        scheduleId,
        dosageMg: sched.dosage,
        unit: sched.unit ?? phase.unit,
        // The slot's display time on the user's clock, as DoseSlot.localTime.
        time: resolveScheduleLocalTime(sched, date, timezone),
      },
    };
  }
  return { found: true as const, slot: undefined };
}

async function slotLog(userId: string, scheduleId: string, date: string) {
  const logs = await db
    .select()
    .from(doseLogs)
    .where(
      and(
        eq(doseLogs.userId, userId),
        eq(doseLogs.scheduleId, scheduleId),
        eq(doseLogs.scheduledDate, date),
        isNull(doseLogs.deletedAt),
      ),
    );
  return selectSlotLog(logs);
}

/**
 * Id for a slot's first log (lib/dose-log-service.ts
 * `newScheduledDoseLogId`): the deterministic id, or a random one when a row
 * with that id already exists (a tombstone is never resurrected).
 */
async function newScheduledDoseLogId(scheduleId: string, date: string): Promise<string> {
  const id = scheduledDoseLogId(scheduleId, date);
  const taken = await db.select({ id: doseLogs.id }).from(doseLogs).where(eq(doseLogs.id, id));
  return taken.length > 0 ? crypto.randomUUID() : id;
}

// ---------------------------------------------------------------------------
// log_dose
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mark one scheduled dose taken, skipped or not taken (undo of a take or a
 * skip), as the Today screen and voice do (takeInTx, skipInTx, untakeInTx,
 * unskipInTx in lib/dose-log-service.ts).
 */
export async function logDose(
  userId: string,
  input: LogDoseInput,
  now = Date.now(),
): Promise<LogDoseResult> {
  const { scheduleId, date, action } = input;
  if (!DATE_RE.test(date)) return refuse("invalid", "date must be YYYY-MM-DD.");
  if (input.takenAt !== undefined) {
    if (!Number.isFinite(input.takenAt)) return refuse("invalid", "Invalid time.");
    if (input.takenAt > now + FUTURE_TAKEN_AT_GRACE_MS) {
      return refuse("future_time", "A dose can't be recorded as taken at a future time.");
    }
  }
  const timezone = await getUserTimeZone(userId, input.timezone);

  const resolved = await resolveSlot(userId, scheduleId, date, timezone);
  if (!resolved.found) {
    return refuse(
      "not_found",
      "No schedule with this schedule_id on the user's list. Get schedule ids from get_today_summary or list_medications.",
    );
  }
  const slot = resolved.slot;
  if (!slot) {
    return refuse(
      "not_in_regimen",
      `This schedule has no dose on ${date}: it is not part of the medicines in effect that day (or not on that weekday). Check get_today_summary or list_medications.`,
    );
  }

  const prev = await slotLog(userId, scheduleId, date);
  const today = dateKeyIn(now, timezone);
  const base = {
    prescription_id: slot.prescriptionId,
    prescription_name: slot.prescriptionName,
    schedule_id: scheduleId,
    date,
    time: slot.time,
  };

  // lib/dose-log-service.ts `assertNotFutureDay`: a dose of a later day can't
  // be taken or skipped, unless it was rescheduled to today or earlier.
  const futureDay = (verb: "take" | "skip"): Refusal | null => {
    if (date <= today) return null;
    const movedIn =
      prev?.status === "rescheduled" &&
      prev.remindAt != null &&
      Number.isFinite(prev.remindAt) &&
      dateKeyIn(prev.remindAt, timezone) <= today;
    return movedIn
      ? null
      : refuse("future_day", `Cannot ${verb} a dose scheduled for a future date (${date}; today is ${today}).`);
  };

  const steps: Step[] = [];
  const audit = (a: AuditAction, details: Record<string, unknown>) =>
    steps.push(auditStep(userId, timezone, now, a, details));
  const slotRef = {
    prescriptionId: slot.prescriptionId,
    phaseId: slot.phaseId,
    scheduleId,
    scheduledDate: date,
    scheduledTime: slot.time,
  };

  /** lib/dose-log-service.ts `writeSlotLog`: patch `prev`, or insert under `id`. */
  const writeSlotLog = (id: string, status: string, patch: Record<string, unknown>) => {
    if (prev) {
      steps.push((exec) =>
        exec
          .update(doseLogs)
          .set({
            status,
            actionTimestamp: now,
            timezone,
            ...nullify(patch),
            updatedAt: now,
            serverUpdatedAt: now,
          })
          .where(and(eq(doseLogs.id, prev.id), eq(doseLogs.userId, userId))),
      );
      return;
    }
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    steps.push((exec) =>
      exec.insert(doseLogs).values({
        id,
        ...slotRef,
        kind: "scheduled",
        status,
        actionTimestamp: now,
        ...defined,
        ...newRowFields(userId, timezone, now),
      }),
    );
  };

  /** lib/dose-log-service.ts `restoreTakenStock`: put back a taken dose's pills. */
  const restoreTakenStock = async (logId: string): Promise<{ pills: number; item?: InventoryRow }> => {
    if (prev?.status !== "taken" || !prev.inventoryItemId) return { pills: 0 };
    const item = await itemById(userId, prev.inventoryItemId);
    if (!item) return { pills: 0 };
    const pills = prev.pillsConsumed ?? calculatePillsConsumed(slot.dosageMg, item.strength) ?? 0;
    if (!(pills > 0)) return { pills: 0 };
    steps.push(cachedStockStep(userId, item, pills, now));
    steps.push(consumedTxStep(userId, timezone, now, item.id, pills, logId));
    return { pills, item };
  };

  const finish = async (
    logId: string,
    status: string,
    pillsConsumed: number,
    stockItem: InventoryRow | undefined,
    change: number,
    takenAt?: number,
  ): Promise<LogDoseResult> => {
    await runAtomically((exec) => steps.map((s) => s(exec)));
    return {
      ok: true,
      dose_log_id: logId,
      ...base,
      status,
      changed: true,
      ...(takenAt !== undefined && { taken_at: takenAt }),
      pills_consumed: pillsConsumed,
      stock:
        stockItem && change !== 0
          ? {
              inventory_item_id: stockItem.id,
              change,
              stock_after: await derivedStock(userId, stockItem.id),
            }
          : null,
    };
  };

  switch (action) {
    case "taken": {
      const refusal = futureDay("take");
      if (refusal) return refusal;
      // An already-taken dose is left exactly as it is.
      if (prev?.status === "taken") {
        return {
          ok: true,
          dose_log_id: prev.id,
          ...base,
          status: "taken",
          changed: false,
          ...(prev.actionTimestamp != null && { taken_at: prev.actionTimestamp }),
          pills_consumed: prev.pillsConsumed ?? 0,
          stock: null,
        };
      }
      const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));
      const inventory = activeOf(await brandsOf(userId, slot.prescriptionId));
      const pills = inventory && calculatePillsConsumed(slot.dosageMg, inventory.strength);
      const invalidStrength = !!inventory && pills === undefined;
      const inventoryItemId = pills !== undefined ? inventory?.id : undefined;
      const takenAt = input.takenAt ?? now;
      const patch: Record<string, unknown> = {
        skipReason: undefined,
        doseAmount: slot.dosageMg,
        doseUnit: slot.unit,
        inventoryItemId,
        pillsConsumed: pills ?? 0,
        pillStrength: inventory?.strength,
        actionTimestamp: takenAt,
      };
      // The log goes first: the consumed transaction references it.
      writeSlotLog(logId, "taken", patch);
      // Negative stock is allowed (user decision).
      if (inventory && pills !== undefined && pills !== 0) {
        steps.push(cachedStockStep(userId, inventory, -pills, now));
        steps.push(consumedTxStep(userId, timezone, now, inventory.id, -pills, logId));
      }
      const details: Record<string, unknown> = {
        prescriptionId: slot.prescriptionId,
        date,
        time: slot.time,
        dosageMg: slot.dosageMg,
        pillsConsumed: pills ?? 0,
        inventoryItemId,
      };
      if (pills !== undefined && pills > 0 && !isCleanFraction(pills)) details.warning = "odd_fraction";
      if (invalidStrength) details.warning = "invalid_strength";
      audit("dose_taken", details);
      return finish(logId, "taken", pills ?? 0, inventory, -(pills ?? 0), takenAt);
    }

    case "skipped": {
      const refusal = futureDay("skip");
      if (refusal) return refusal;
      if (prev?.status === "skipped") {
        return {
          ok: true,
          dose_log_id: prev.id,
          ...base,
          status: "skipped",
          changed: false,
          pills_consumed: 0,
          stock: null,
        };
      }
      const logId = prev?.id ?? (await newScheduledDoseLogId(scheduleId, date));
      const restored = await restoreTakenStock(logId);
      writeSlotLog(logId, "skipped", {
        doseAmount: slot.dosageMg,
        doseUnit: slot.unit,
        pillsConsumed: 0,
        skipReason: input.skipReason,
      });
      audit("dose_skipped", {
        prescriptionId: slot.prescriptionId,
        date,
        time: slot.time,
        dosageMg: slot.dosageMg,
        pillsConsumed: restored.pills,
        reason: input.skipReason,
        inventoryItemId: prev?.inventoryItemId ?? undefined,
      });
      return finish(logId, "skipped", 0, restored.item, restored.pills);
    }

    case "not_taken": {
      if (prev?.status === "taken") {
        const restored = await restoreTakenStock(prev.id);
        const status = reopenedStatus(prev.remindAt, now);
        writeSlotLog(prev.id, status, { pillsConsumed: 0, skipReason: undefined });
        audit("dose_untaken", {
          prescriptionId: slot.prescriptionId,
          date,
          time: slot.time,
          dosageMg: slot.dosageMg,
          pillsConsumed: restored.pills,
          inventoryItemId: prev.inventoryItemId ?? undefined,
        });
        return finish(prev.id, status, 0, restored.item, restored.pills);
      }
      if (prev?.status === "skipped") {
        const status = reopenedStatus(prev.remindAt, now);
        writeSlotLog(prev.id, status, { skipReason: undefined });
        audit("dose_untaken", { prescriptionId: slot.prescriptionId, date, time: slot.time, unskipped: true });
        return finish(prev.id, status, 0, undefined, 0);
      }
      return refuse(
        "nothing_to_undo",
        `${slot.prescriptionName} at ${slot.time} on ${date} is not marked taken or skipped: there is nothing to undo.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// log_extra_medicine
// ---------------------------------------------------------------------------

/**
 * The medicine on the list a name means, exactly (generic or brand name, no
 * case, spaces or marks), as lib/voice-medication.ts `matchMedicine` with
 * `loose: false`.
 */
async function matchListed(userId: string, name: string) {
  const wanted = norm(name);
  if (wanted === "") return { found: false as const };
  const live = await db
    .select({ id: prescriptions.id, genericName: prescriptions.genericName })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.userId, userId),
        eq(prescriptions.isActive, true),
        isNull(prescriptions.deletedAt),
      ),
    );
  if (live.length === 0) return { found: false as const };
  const brands = await db
    .select({ id: inventoryItems.id, prescriptionId: inventoryItems.prescriptionId, brandName: inventoryItems.brandName })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.userId, userId),
        isNull(inventoryItems.deletedAt),
        or(isNull(inventoryItems.isArchived), eq(inventoryItems.isArchived, false)),
        inArray(inventoryItems.prescriptionId, live.map((p) => p.id)),
      ),
    )
    .orderBy(asc(inventoryItems.id));
  const hits: { prescriptionId: string; brandId?: string }[] = [];
  for (const p of live) {
    if (norm(p.genericName) === wanted) hits.push({ prescriptionId: p.id });
    for (const b of brands) {
      if (b.prescriptionId === p.id && norm(b.brandName) === wanted) {
        hits.push({ prescriptionId: p.id, brandId: b.id });
      }
    }
  }
  const ids = [...new Set(hits.map((h) => h.prescriptionId))];
  if (ids.length > 1) {
    return {
      found: false as const,
      ambiguous: ids.map((id) => live.find((p) => p.id === id)!.genericName),
    };
  }
  if (ids.length === 0) return { found: false as const };
  return {
    found: true as const,
    prescriptionId: ids[0]!,
    brandId: hits.find((h) => h.brandId)?.brandId,
  };
}

/**
 * Log a medicine taken outside the schedule. A medicine on the list is an
 * as-needed (PRN) dose that takes its pills from stock when the amount
 * allows the sum (lib/dose-log-service.ts `logPrnDose`, planned as
 * lib/voice-medication.ts `planExtra`); one not on the list is saved by
 * name only (`logUnlistedDose`).
 */
export async function logExtraMedicine(
  userId: string,
  input: LogExtraMedicineInput,
  now = Date.now(),
): Promise<LogExtraMedicineResult> {
  const takenAt = input.takenAt ?? now;
  if (!Number.isFinite(takenAt)) return refuse("invalid", "Invalid time.");
  if (takenAt > now + FUTURE_TAKEN_AT_GRACE_MS) {
    return refuse("future_time", "Cannot record a dose as taken at a future time.");
  }
  const timezone = await getUserTimeZone(userId, input.timezone);
  const note = input.note?.trim() || undefined;
  const date = dateKeyIn(takenAt, timezone);
  const time = hhmmIn(takenAt, timezone);

  let prescriptionId = input.prescriptionId;
  let brandId: string | undefined;
  const name = input.medicineName?.trim() ?? "";
  if (!prescriptionId) {
    if (name === "") {
      return refuse("invalid", "Give prescription_id for a medicine on the list, or medicine_name for one that is not.");
    }
    // A name that is exactly a medicine on the list is that medicine, as in voice.
    const match = await matchListed(userId, name);
    if (!match.found && match.ambiguous) {
      return refuse(
        "ambiguous_medicine",
        `"${name}" could be ${match.ambiguous.join(" or ")}. Pass the prescription_id from list_medications.`,
      );
    }
    if (match.found) {
      prescriptionId = match.prescriptionId;
      brandId = match.brandId;
    }
  }

  if (prescriptionId) {
    const p = await livePrescription(userId, prescriptionId);
    if (!p) {
      return refuse(
        "not_found",
        "No active medicine with this prescription_id on the user's list. Get prescription ids from list_medications.",
      );
    }
    const brands = await brandsOf(userId, p.id);
    // Dose math as voice plans it (the named brand, else the active one,
    // else the only one); the stock taken from as logPrnDose takes it (the
    // active brand only).
    const planBrand = brands.find((b) => b.id === brandId) ?? voiceBrandOf(brands);
    let dosageMg: number | undefined;
    if (input.amount !== undefined) {
      if (input.unit === "mg") dosageMg = input.amount;
      else if ((input.unit === "tablet" || input.unit === "capsule") && planBrand && planBrand.strength > 0) {
        dosageMg = input.amount * planBrand.strength;
      }
    }

    const doseLogId = crypto.randomUUID();
    const steps: Step[] = [];
    let inventoryItemId: string | undefined;
    let pillsConsumed = 0;
    const inventory = activeOf(brands);
    if (dosageMg !== undefined && dosageMg > 0 && inventory) {
      const pills = calculatePillsConsumed(dosageMg, inventory.strength);
      if (pills !== undefined) {
        inventoryItemId = inventory.id;
        pillsConsumed = pills;
        steps.push(cachedStockStep(userId, inventory, -pills, now));
        steps.push(consumedTxStep(userId, timezone, now, inventory.id, -pills, doseLogId));
      }
    }
    // kind='prn' with no phase/schedule, as logPrnDose. Its actionTimestamp
    // is the picked minute (logPrnDose rebuilds it from date + "HH:MM").
    const doseLog = {
      id: doseLogId,
      prescriptionId: p.id,
      kind: "prn",
      scheduledDate: date,
      scheduledTime: time,
      status: "taken",
      actionTimestamp: takenAt - (((takenAt % 60_000) + 60_000) % 60_000),
      ...(inventoryItemId !== undefined && { inventoryItemId }),
      ...(dosageMg !== undefined && { doseMg: dosageMg }),
      ...(note !== undefined && { note }),
      ...newRowFields(userId, timezone, now),
    };
    // The log goes first: the transaction references it.
    steps.unshift((exec) => exec.insert(doseLogs).values(doseLog));
    steps.push(
      auditStep(userId, timezone, now, "dose_taken", {
        prescriptionId: p.id,
        date,
        time,
        kind: "prn",
        doseMg: dosageMg,
        pillsConsumed,
        inventoryItemId,
      }),
    );
    await runAtomically((exec) => steps.map((s) => s(exec)));
    return {
      ok: true,
      dose_log_id: doseLogId,
      listed: true,
      prescription_id: p.id,
      medicine_name: p.genericName,
      date,
      time,
      taken_at: doseLog.actionTimestamp,
      pills_consumed: pillsConsumed,
      stock:
        inventoryItemId !== undefined && pillsConsumed !== 0
          ? {
              inventory_item_id: inventoryItemId,
              change: -pillsConsumed,
              stock_after: await derivedStock(userId, inventoryItemId),
            }
          : null,
    };
  }

  // Not on the list: logUnlistedDose. No stock moves, no prescription is made.
  const doseLogId = crypto.randomUUID();
  const doseLog = {
    id: doseLogId,
    medicineName: name,
    kind: "prn",
    scheduledDate: date,
    scheduledTime: time,
    status: "taken",
    actionTimestamp: takenAt,
    ...(input.amount !== undefined && { doseAmount: input.amount }),
    ...(input.amount !== undefined && input.unit !== undefined && { doseUnit: input.unit }),
    ...(input.amount !== undefined && input.unit === "mg" && { doseMg: input.amount }),
    ...(note !== undefined && { note }),
    ...newRowFields(userId, timezone, now),
  };
  await runAtomically((exec) => [
    exec.insert(doseLogs).values(doseLog),
    auditStep(userId, timezone, now, "dose_taken", {
      medicineName: name,
      date,
      time,
      kind: "prn",
      unlisted: true,
    })(exec),
  ]);
  return {
    ok: true,
    dose_log_id: doseLogId,
    listed: false,
    prescription_id: null,
    medicine_name: name,
    date,
    time,
    taken_at: takenAt,
    pills_consumed: 0,
    stock: null,
  };
}

// ---------------------------------------------------------------------------
// refill_stock
// ---------------------------------------------------------------------------

/** The note a connector refill carries, as voice writes "Refill by voice". */
export const MCP_REFILL_NOTE = "Refill via Claude";

/**
 * Add pills to a medicine's stock (lib/inventory-service.ts `adjustStock`
 * with type "refill", as voice calls it). The item is the one voice picks:
 * the active brand, else the only one. A medicine with no stock item is
 * refused: stock items are set up in the app.
 */
export async function refillStock(
  userId: string,
  input: RefillStockInput,
  now = Date.now(),
): Promise<RefillStockResult> {
  if (!Number.isFinite(input.pills) || input.pills <= 0) {
    return refuse("invalid", "A refill must add pills.");
  }
  const p = await livePrescription(userId, input.prescriptionId);
  if (!p) {
    return refuse(
      "not_found",
      "No active medicine with this prescription_id on the user's list. Get prescription ids from list_medications.",
    );
  }
  const item = voiceBrandOf(await brandsOf(userId, p.id));
  if (!item) {
    return refuse(
      "no_stock_item",
      `${p.genericName} has no stock to refill. The user adds a brand in the app's Medications window first.`,
    );
  }
  const timezone = await getUserTimeZone(userId, undefined);
  const before = await liveTxSum(userId, item.id);
  const stockAfter = roundStock(before + input.pills);
  const transactionId = crypto.randomUUID();

  await runAtomically((exec) => [
    exec.insert(inventoryTransactions).values({
      id: transactionId,
      inventoryItemId: item.id,
      timestamp: now,
      amount: input.pills,
      type: "refill",
      note: MCP_REFILL_NOTE,
      ...newRowFields(userId, timezone, now),
    }),
    // refreshCachedStock: the cache only moves when it differs.
    ...(item.currentStock == null || roundStock(item.currentStock) !== stockAfter
      ? [
          exec
            .update(inventoryItems)
            .set({ currentStock: stockAfter, updatedAt: now, serverUpdatedAt: now })
            .where(and(eq(inventoryItems.id, item.id), eq(inventoryItems.userId, userId))),
        ]
      : []),
    auditStep(userId, timezone, now, "inventory_adjusted", {
      inventoryItemId: item.id,
      delta: input.pills,
      newStock: stockAfter,
      note: MCP_REFILL_NOTE,
    })(exec),
  ]);

  return {
    ok: true,
    transaction_id: transactionId,
    prescription_id: p.id,
    prescription_name: p.genericName,
    inventory_item_id: item.id,
    brand_name: item.brandName,
    pills_added: input.pills,
    stock_after: await derivedStock(userId, item.id),
  };
}

/** lib/inventory-service.ts `deriveStock`: the live ledger sum (0 when empty). */
async function liveTxSum(userId: string, inventoryItemId: string): Promise<number> {
  const rows = await db
    .select({ amount: inventoryTransactions.amount })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.userId, userId),
        eq(inventoryTransactions.inventoryItemId, inventoryItemId),
        isNull(inventoryTransactions.deletedAt),
      ),
    );
  return roundStock(rows.reduce((acc, r) => acc + r.amount, 0));
}

// ---------------------------------------------------------------------------
// Delete (connector rows only)
// ---------------------------------------------------------------------------

/**
 * Remove an extra dose or a refill the connector logged. Only rows with
 * deviceId MCP_DEVICE_ID qualify; the user's own are refused. An extra dose
 * is undone as lib/dose-action-service.ts `undoPrnDose` does (its consumed
 * transactions tombstoned, the pills back in the cached stock); a refill as
 * lib/inventory-service.ts `deleteInventoryTransaction` (tombstoned, cache
 * re-derived).
 */
export async function deleteMedicationRecord(
  userId: string,
  kind: "extra_medicine" | "stock_refill",
  id: string,
  now = Date.now(),
): Promise<MedicationDeleteResult> {
  const tombstone = { deletedAt: now, updatedAt: now, serverUpdatedAt: now };

  if (kind === "extra_medicine") {
    const rows = await db
      .select()
      .from(doseLogs)
      .where(
        and(
          eq(doseLogs.userId, userId),
          eq(doseLogs.id, id),
          eq(doseLogs.kind, "prn"),
          isNull(doseLogs.deletedAt),
        ),
      );
    const log = rows[0];
    if (!log) return { deleted: false, reason: "not_found" };
    if (log.deviceId !== MCP_DEVICE_ID) return { deleted: false, reason: "not_connector_entry" };
    const timezone = log.timezone;

    const steps: Step[] = [];
    let pillsRestored = 0;
    let item: InventoryRow | undefined;
    if (log.inventoryItemId) {
      const linked = await db
        .select({ id: inventoryTransactions.id, amount: inventoryTransactions.amount })
        .from(inventoryTransactions)
        .where(
          and(
            eq(inventoryTransactions.userId, userId),
            eq(inventoryTransactions.inventoryItemId, log.inventoryItemId),
            eq(inventoryTransactions.doseLogId, id),
            eq(inventoryTransactions.type, "consumed"),
            isNull(inventoryTransactions.deletedAt),
          ),
        );
      for (const tx of linked) {
        steps.push((exec) =>
          exec
            .update(inventoryTransactions)
            .set(tombstone)
            .where(and(eq(inventoryTransactions.id, tx.id), eq(inventoryTransactions.userId, userId))),
        );
        pillsRestored -= tx.amount;
      }
      item = await itemById(userId, log.inventoryItemId);
      if (item && pillsRestored !== 0) steps.push(cachedStockStep(userId, item, pillsRestored, now));
    }
    steps.push((exec) =>
      exec
        .update(doseLogs)
        .set(tombstone)
        .where(and(eq(doseLogs.id, id), eq(doseLogs.userId, userId))),
    );
    steps.push(
      auditStep(userId, timezone, now, "dose_untaken", {
        prescriptionId: log.prescriptionId ?? undefined,
        date: log.scheduledDate,
        time: log.scheduledTime,
        kind: "prn",
        pillsConsumed: pillsRestored,
        inventoryItemId: log.inventoryItemId ?? undefined,
      }),
    );
    await runAtomically((exec) => steps.map((s) => s(exec)));
    return {
      deleted: true,
      kind,
      id,
      stock:
        item && pillsRestored !== 0
          ? {
              inventory_item_id: item.id,
              change: roundStock(pillsRestored),
              stock_after: await derivedStock(userId, item.id),
            }
          : null,
    };
  }

  const rows = await db
    .select()
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.userId, userId),
        eq(inventoryTransactions.id, id),
        eq(inventoryTransactions.type, "refill"),
        isNull(inventoryTransactions.deletedAt),
      ),
    );
  const tx = rows[0];
  if (!tx) return { deleted: false, reason: "not_found" };
  if (tx.deviceId !== MCP_DEVICE_ID) return { deleted: false, reason: "not_connector_entry" };

  const item = await itemById(userId, tx.inventoryItemId);
  const stockAfter = roundStock((await liveTxSum(userId, tx.inventoryItemId)) - tx.amount);
  await runAtomically((exec) => [
    exec
      .update(inventoryTransactions)
      .set(tombstone)
      .where(and(eq(inventoryTransactions.id, id), eq(inventoryTransactions.userId, userId))),
    ...(item && (item.currentStock == null || roundStock(item.currentStock) !== stockAfter)
      ? [
          exec
            .update(inventoryItems)
            .set({ currentStock: stockAfter, updatedAt: now, serverUpdatedAt: now })
            .where(and(eq(inventoryItems.id, item.id), eq(inventoryItems.userId, userId))),
        ]
      : []),
    auditStep(userId, tx.timezone, now, "inventory_adjusted", {
      transactionId: id,
      inventoryItemId: tx.inventoryItemId,
      action: "transaction_deleted",
    })(exec),
  ]);
  return {
    deleted: true,
    kind,
    id,
    stock: {
      inventory_item_id: tx.inventoryItemId,
      change: -tx.amount,
      stock_after: await derivedStock(userId, tx.inventoryItemId),
    },
  };
}
