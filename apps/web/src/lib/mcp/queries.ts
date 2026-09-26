/**
 * Read-only Drizzle queries that back the MCP tools.
 *
 * Every function is user-scoped — the caller MUST pass the userId resolved
 * from the validated MCP bearer token. Cross-user reads are impossible
 * because every WHERE clause includes `eq(table.userId, userId)`.
 *
 * Tombstones (`deletedAt IS NOT NULL`) are filtered out — tools should
 * never expose soft-deleted rows to the model.
 *
 * Every query that scans a time range has a hard row cap (5000) returned
 * as a `truncated` flag so the model knows to narrow the window. Over the
 * cap the NEWEST rows are kept (they are usually the relevant ones); rows
 * still come back oldest first.
 */
import { and, asc, desc, eq, gte, isNull, lte, or, sql, inArray } from "drizzle-orm";
import { db } from "@intake/db/client";
import { selectEffectivePhases } from "@intake/core/effective-phase";
import {
  intakeRecords,
  weightRecords,
  bloodPressureRecords,
  eatingRecords,
  substanceRecords,
  urinationRecords,
  prescriptions,
  titrationPlans,
  medicationPhases,
  phaseSchedules,
  inventoryItems,
  inventoryTransactions,
  doseLogs,
  pushSettings,
  pushSubscriptions,
  userSettings,
} from "@intake/db/schema";
import { resolveTimeZone, zonedDayWindow } from "@/lib/mcp/day-window";
import { resolveDoseStatus } from "@/lib/dose-status";

const MAX_ROWS = 5000;
const DEFAULT_DAY_START_HOUR = 2;

interface DateRange {
  start: number;
  end: number;
}

function notDeleted<T extends { deletedAt: unknown }>(table: T) {
  return isNull((table as { deletedAt: { name: string } }).deletedAt as never);
}

/**
 * The user's synced settings row (the newest live one — the app treats the
 * table as a per-user singleton, newest row wins), or undefined.
 */
async function getSyncedSettings(userId: string) {
  const rows = await db
    .select({
      dayStartHour: userSettings.dayStartHour,
      homeTimezone: userSettings.homeTimezone,
    })
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), isNull(userSettings.deletedAt)))
    .orderBy(desc(userSettings.updatedAt), asc(userSettings.id))
    .limit(1);
  return rows[0];
}

/**
 * The day-start hour: the synced settings are the source of truth; the copy
 * kept with the push settings covers users whose settings have not synced yet.
 */
async function getDayStartHour(
  userId: string,
  synced: { dayStartHour: number } | undefined,
): Promise<number> {
  if (synced) return synced.dayStartHour;
  const rows = await db
    .select({ dayStartHour: pushSettings.dayStartHour })
    .from(pushSettings)
    .where(eq(pushSettings.userId, userId))
    .limit(1);
  return rows[0]?.dayStartHour ?? DEFAULT_DAY_START_HOUR;
}

/**
 * The IANA zone the client last reported with its push subscription, else
 * the user's synced home timezone.
 */
async function getStoredTimeZone(
  userId: string,
  synced: { homeTimezone: string | null } | undefined,
): Promise<string | null> {
  const rows = await db
    .select({ timezone: pushSubscriptions.timezone })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  return rows[0]?.timezone ?? synced?.homeTimezone ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Today summary
// ─────────────────────────────────────────────────────────────────────────

export async function getTodaySummary(
  userId: string,
  opts: { timezone?: string | undefined; now?: number } = {},
) {
  const nowTs = opts.now ?? Date.now();
  const synced = await getSyncedSettings(userId);
  const [dayStartHour, storedTz] = await Promise.all([
    getDayStartHour(userId, synced),
    opts.timezone ? Promise.resolve(null) : getStoredTimeZone(userId, synced),
  ]);
  // The server runs in UTC; the day boundary has to be the user's.
  const timezone = resolveTimeZone(opts.timezone, storedTz);
  const window = zonedDayWindow(nowTs, timezone, dayStartHour);
  const startTs = window.start;

  const intake = await db
    .select({
      type: intakeRecords.type,
      total: sql<number>`sum(${intakeRecords.amount})`.as("total"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(intakeRecords)
    .where(
      and(
        eq(intakeRecords.userId, userId),
        gte(intakeRecords.timestamp, startTs),
        lte(intakeRecords.timestamp, nowTs),
        isNull(intakeRecords.deletedAt),
      ),
    )
    .groupBy(intakeRecords.type);

  const latestBp = await db
    .select({
      systolic: bloodPressureRecords.systolic,
      diastolic: bloodPressureRecords.diastolic,
      heartRate: bloodPressureRecords.heartRate,
      timestamp: bloodPressureRecords.timestamp,
    })
    .from(bloodPressureRecords)
    .where(
      and(
        eq(bloodPressureRecords.userId, userId),
        isNull(bloodPressureRecords.deletedAt),
      ),
    )
    .orderBy(desc(bloodPressureRecords.timestamp))
    .limit(1);

  const latestWeight = await db
    .select({
      weight: weightRecords.weight,
      timestamp: weightRecords.timestamp,
    })
    .from(weightRecords)
    .where(
      and(
        eq(weightRecords.userId, userId),
        isNull(weightRecords.deletedAt),
      ),
    )
    .orderBy(desc(weightRecords.timestamp))
    .limit(1);

  const doses = await getDoseDay(userId, window.date, window.weekday, timezone);

  // The stored intake type is "salt", but every value is sodium in mg (table
  // salt is converted on entry). Label it as sodium so a reader doesn't take
  // 1400 mg sodium for 1.4 g of salt.
  const intakeTotals = {
    water_ml: 0,
    sodium_mg: 0,
    sugar_g: 0,
    potassium_mg: 0,
  };
  for (const row of intake) {
    if (row.type === "water") intakeTotals.water_ml = Number(row.total) || 0;
    else if (row.type === "salt") intakeTotals.sodium_mg = Number(row.total) || 0;
    else if (row.type === "sugar") intakeTotals.sugar_g = Number(row.total) || 0;
    else if (row.type === "potassium") intakeTotals.potassium_mg = Number(row.total) || 0;
  }

  return {
    timezone,
    day_started_at: startTs,
    now: nowTs,
    intake: intakeTotals,
    latest_blood_pressure: latestBp[0] ?? null,
    latest_weight: latestWeight[0] ?? null,
    doses,
  };
}

/**
 * Loads the effective regimen (active prescriptions, the effective phase of
 * each, and that phase's live enabled schedules) — the same selection the
 * app's dose schedule makes, via the shared precedence helper.
 */
async function loadEffectiveRegimen(userId: string) {
  const presc = await db
    .select({
      id: prescriptions.id,
      genericName: prescriptions.genericName,
      indication: prescriptions.indication,
      notes: prescriptions.notes,
      isActive: prescriptions.isActive,
      createdAt: prescriptions.createdAt,
    })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.userId, userId),
        eq(prescriptions.isActive, true),
        isNull(prescriptions.deletedAt),
      ),
    );
  if (presc.length === 0) return { presc, effective: [] };

  const phases = await db
    .select({
      id: medicationPhases.id,
      prescriptionId: medicationPhases.prescriptionId,
      type: medicationPhases.type,
      titrationPlanId: medicationPhases.titrationPlanId,
      unit: medicationPhases.unit,
      startDate: medicationPhases.startDate,
      endDate: medicationPhases.endDate,
      foodInstruction: medicationPhases.foodInstruction,
      status: medicationPhases.status,
      deletedAt: medicationPhases.deletedAt,
    })
    .from(medicationPhases)
    .where(
      and(
        eq(medicationPhases.userId, userId),
        eq(medicationPhases.status, "active"),
        inArray(
          medicationPhases.prescriptionId,
          presc.map((p) => p.id),
        ),
        isNull(medicationPhases.deletedAt),
      ),
    )
    // Deterministic "first candidate" for the precedence helper when a
    // prescription has several non-overriding active phases.
    .orderBy(asc(medicationPhases.startDate), asc(medicationPhases.id));

  const phaseIds = phases.map((p) => p.id);
  const schedules =
    phaseIds.length === 0
      ? []
      : await db
          .select({
            id: phaseSchedules.id,
            phaseId: phaseSchedules.phaseId,
            // Canonical wall-clock "HH:MM" in anchorTimezone; scheduleTimeUTC
            // is derived from it.
            time: phaseSchedules.time,
            scheduleTimeUTC: phaseSchedules.scheduleTimeUTC,
            anchorTimezone: phaseSchedules.anchorTimezone,
            dosage: phaseSchedules.dosage,
            unit: phaseSchedules.unit,
            daysOfWeek: phaseSchedules.daysOfWeek,
            enabled: phaseSchedules.enabled,
            deletedAt: phaseSchedules.deletedAt,
          })
          .from(phaseSchedules)
          .where(
            and(
              eq(phaseSchedules.userId, userId),
              eq(phaseSchedules.enabled, true),
              inArray(phaseSchedules.phaseId, phaseIds),
              isNull(phaseSchedules.deletedAt),
            ),
          )
          .orderBy(asc(phaseSchedules.time), asc(phaseSchedules.id));

  return { presc, effective: selectEffectivePhases(phases, schedules) };
}

type SlotStatus = "taken" | "skipped" | "outstanding";

/**
 * The app's rule (resolveDoseStatus) for a slot on the current day: only a
 * taken or skipped log settles it. No log, a "pending" log or a
 * "rescheduled" one (still owed, at its new time) is outstanding.
 */
function slotStatus(logStatus: string | undefined, date: string): SlotStatus {
  const status = resolveDoseStatus(logStatus, date, date);
  return status === "taken" || status === "skipped" ? status : "outstanding";
}

/**
 * Today's doses keyed by scheduledDate, as the app's daily schedule shows
 * them: every slot the effective regimen expects on `date`, with its status,
 * plus the logs for `date` that match no slot (PRN doses, or logs against a
 * phase/schedule that is no longer in effect).
 */
async function getDoseDay(
  userId: string,
  date: string,
  weekday: number,
  timezone: string,
) {
  const [{ presc, effective }, logs] = await Promise.all([
    loadEffectiveRegimen(userId),
    db
      .select({
        prescriptionId: doseLogs.prescriptionId,
        phaseId: doseLogs.phaseId,
        scheduleId: doseLogs.scheduleId,
        kind: doseLogs.kind,
        status: doseLogs.status,
      })
      .from(doseLogs)
      .where(
        and(
          eq(doseLogs.userId, userId),
          eq(doseLogs.scheduledDate, date),
          isNull(doseLogs.deletedAt),
        ),
      ),
  ]);

  const prescById = new Map(presc.map((p) => [p.id, p]));
  const logByKey = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    if (log.kind === "scheduled" && log.phaseId && log.scheduleId) {
      logByKey.set(`${log.prescriptionId}|${log.phaseId}|${log.scheduleId}`, log);
    }
  }

  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const matched = new Set<(typeof logs)[number]>();
  const slots = [];
  for (const { prescriptionId, phase, schedules } of effective) {
    const p = prescById.get(prescriptionId);
    if (!p) continue;
    // As in the app, no slots before the prescription existed.
    if (dateKey.format(p.createdAt) > date) continue;
    for (const sched of schedules) {
      if (!sched.daysOfWeek.includes(weekday)) continue;
      const log = logByKey.get(`${prescriptionId}|${phase.id}|${sched.id}`);
      if (log) matched.add(log);
      slots.push({
        prescriptionId,
        genericName: p.genericName,
        phaseId: phase.id,
        scheduleId: sched.id,
        time: sched.time,
        anchorTimezone: sched.anchorTimezone,
        dosage: sched.dosage,
        unit: sched.unit ?? phase.unit,
        status: slotStatus(log?.status, date),
      });
    }
  }
  slots.sort((a, b) => a.time.localeCompare(b.time));

  const unscheduledCounts = new Map<string, { kind: string; status: string; count: number }>();
  for (const log of logs) {
    if (matched.has(log)) continue;
    const key = `${log.kind}|${log.status}`;
    const entry = unscheduledCounts.get(key);
    if (entry) entry.count += 1;
    else unscheduledCounts.set(key, { kind: log.kind, status: log.status, count: 1 });
  }

  return {
    scheduled_date: date,
    taken: slots.filter((sl) => sl.status === "taken").length,
    skipped: slots.filter((sl) => sl.status === "skipped").length,
    outstanding: slots.filter((sl) => sl.status === "outstanding").length,
    slots,
    unscheduled: Array.from(unscheduledCounts.values()),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// History queries
// ─────────────────────────────────────────────────────────────────────────

export type IntakeQueryType = "water" | "sodium" | "sugar" | "potassium" | "all";

/** Stored intake type → the name the MCP reports ("salt" holds sodium mg). */
function reportedIntakeType(stored: string): string {
  return stored === "salt" ? "sodium" : stored;
}

export async function queryIntakeHistory(
  userId: string,
  type: IntakeQueryType,
  range: DateRange,
) {
  const typeFilter =
    type === "all"
      ? undefined
      : eq(intakeRecords.type, type === "sodium" ? "salt" : type);
  const rows = await db
    .select({
      id: intakeRecords.id,
      type: intakeRecords.type,
      amount: intakeRecords.amount,
      timestamp: intakeRecords.timestamp,
      source: intakeRecords.source,
      note: intakeRecords.note,
      groupId: intakeRecords.groupId,
      groupSource: intakeRecords.groupSource,
      // Sodium rows: what the user entered (e.g. 2 g of salt) — `amount` is
      // already the sodium mg. Null on rows with no recorded source.
      sodiumSource: intakeRecords.sodiumSource,
      sourceAmount: intakeRecords.sourceAmount,
      sourceUnit: intakeRecords.sourceUnit,
    })
    .from(intakeRecords)
    .where(
      and(
        eq(intakeRecords.userId, userId),
        gte(intakeRecords.timestamp, range.start),
        lte(intakeRecords.timestamp, range.end),
        isNull(intakeRecords.deletedAt),
        ...(typeFilter ? [typeFilter] : []),
      ),
    )
    .orderBy(desc(intakeRecords.timestamp), desc(intakeRecords.id))
    .limit(MAX_ROWS + 1);

  const capped = capRows(rows);

  // A water row can be the fluid half of a decomposed drink (e.g. an espresso
  // martini → one water intake row + a caffeine + an alcohol substance, all
  // sharing a groupId). Hydrate those rows with their linked substance so
  // callers can tell which water is a drink — and read its caffeine mg /
  // alcohol ABV — without a second query or regex. The water amounts
  // themselves are untouched, so totals stay honest.
  //
  // `groupId` is the current linkage, written by `logDrink`. The
  // `source: "substance:<id>"` form is what the old implicit auto-water path
  // produced; rows predating the v22 backfill can still carry it with no group,
  // so both are resolved.
  const SUBSTANCE_PREFIX = "substance:";
  const legacySubstanceIdOf = (source: string | null): string | null =>
    source?.startsWith(SUBSTANCE_PREFIX)
      ? source.slice(SUBSTANCE_PREFIX.length)
      : null;

  const substanceIds = Array.from(
    new Set(
      capped.items
        .map((r) => legacySubstanceIdOf(r.source))
        .filter((id): id is string => !!id),
    ),
  );
  const groupIds = Array.from(
    new Set(
      capped.items
        .filter((r) => r.type === "water" && r.groupId)
        .map((r) => r.groupId)
        .filter((id): id is string => !!id),
    ),
  );

  type LinkedSubstance = {
    substanceType: string;
    description: string;
    abvPercent: number | null;
    amountStandardDrinks: number | null;
    amountMg: number | null;
  };
  const substanceById = new Map<string, LinkedSubstance>();
  const substanceByGroupId = new Map<string, LinkedSubstance>();

  if (substanceIds.length > 0 || groupIds.length > 0) {
    const matchers = [
      ...(substanceIds.length > 0
        ? [inArray(substanceRecords.id, substanceIds)]
        : []),
      ...(groupIds.length > 0
        ? [inArray(substanceRecords.groupId, groupIds)]
        : []),
    ];
    const linked = await db
      .select({
        id: substanceRecords.id,
        groupId: substanceRecords.groupId,
        substanceType: substanceRecords.type,
        description: substanceRecords.description,
        abvPercent: substanceRecords.abvPercent,
        amountStandardDrinks: substanceRecords.amountStandardDrinks,
        amountMg: substanceRecords.amountMg,
      })
      .from(substanceRecords)
      .where(
        and(
          eq(substanceRecords.userId, userId),
          matchers.length === 1 ? matchers[0] : or(...matchers),
          isNull(substanceRecords.deletedAt),
        ),
      )
      // A group can hold both a caffeine and an alcohol record (an espresso
      // martini). This field is single-valued, so one has to win — order
      // explicitly by id, otherwise which one wins depends on the database's
      // row order and the answer can change between identical calls.
      .orderBy(asc(substanceRecords.id));
    for (const { id, groupId, ...rest } of linked) {
      substanceById.set(id, rest);
      // First wins, deterministically, per the ordering above. Callers that
      // need every substance on a drink use query_substance_history.
      if (groupId && !substanceByGroupId.has(groupId)) {
        substanceByGroupId.set(groupId, rest);
      }
    }
  }

  return {
    ...capped,
    items: capped.items.map((r) => {
      const legacyId = legacySubstanceIdOf(r.source);
      const substance =
        (legacyId ? substanceById.get(legacyId) : undefined) ??
        (r.type === "water" && r.groupId
          ? substanceByGroupId.get(r.groupId)
          : undefined) ??
        null;
      return { ...r, type: reportedIntakeType(r.type), substance };
    }),
  };
}

export async function queryWeightHistory(userId: string, range: DateRange) {
  const rows = await db
    .select({
      id: weightRecords.id,
      weight: weightRecords.weight,
      timestamp: weightRecords.timestamp,
      note: weightRecords.note,
    })
    .from(weightRecords)
    .where(
      and(
        eq(weightRecords.userId, userId),
        gte(weightRecords.timestamp, range.start),
        lte(weightRecords.timestamp, range.end),
        isNull(weightRecords.deletedAt),
      ),
    )
    .orderBy(desc(weightRecords.timestamp), desc(weightRecords.id))
    .limit(MAX_ROWS + 1);
  return capRows(rows);
}

export async function queryBloodPressureHistory(
  userId: string,
  range: DateRange,
) {
  const rows = await db
    .select({
      id: bloodPressureRecords.id,
      systolic: bloodPressureRecords.systolic,
      diastolic: bloodPressureRecords.diastolic,
      heartRate: bloodPressureRecords.heartRate,
      irregularHeartbeat: bloodPressureRecords.irregularHeartbeat,
      position: bloodPressureRecords.position,
      arm: bloodPressureRecords.arm,
      timestamp: bloodPressureRecords.timestamp,
      note: bloodPressureRecords.note,
    })
    .from(bloodPressureRecords)
    .where(
      and(
        eq(bloodPressureRecords.userId, userId),
        gte(bloodPressureRecords.timestamp, range.start),
        lte(bloodPressureRecords.timestamp, range.end),
        isNull(bloodPressureRecords.deletedAt),
      ),
    )
    .orderBy(desc(bloodPressureRecords.timestamp), desc(bloodPressureRecords.id))
    .limit(MAX_ROWS + 1);
  return capRows(rows);
}

export async function queryEatingHistory(userId: string, range: DateRange) {
  const rows = await db
    .select({
      id: eatingRecords.id,
      grams: eatingRecords.grams,
      note: eatingRecords.note,
      originalInputText: eatingRecords.originalInputText,
      timestamp: eatingRecords.timestamp,
      groupId: eatingRecords.groupId,
    })
    .from(eatingRecords)
    .where(
      and(
        eq(eatingRecords.userId, userId),
        gte(eatingRecords.timestamp, range.start),
        lte(eatingRecords.timestamp, range.end),
        isNull(eatingRecords.deletedAt),
      ),
    )
    .orderBy(desc(eatingRecords.timestamp), desc(eatingRecords.id))
    .limit(MAX_ROWS + 1);
  // Each row keeps its groupId so callers can correlate a food entry with its
  // decomposed substances. We deliberately do NOT embed substances here: the
  // old join only matched substances whose groupId appeared on an *eating*
  // record, so standalone drinks never surfaced and the field returned []
  // misleadingly. query_substance_history is the single source of truth for
  // caffeine/alcohol (see its tool description).
  return capRows(rows);
}

export async function querySubstanceHistory(
  userId: string,
  type: "caffeine" | "alcohol" | "all",
  range: DateRange,
) {
  const typeFilter =
    type === "all" ? undefined : eq(substanceRecords.type, type);
  const rows = await db
    .select({
      id: substanceRecords.id,
      type: substanceRecords.type,
      amountMg: substanceRecords.amountMg,
      amountStandardDrinks: substanceRecords.amountStandardDrinks,
      abvPercent: substanceRecords.abvPercent,
      volumeMl: substanceRecords.volumeMl,
      description: substanceRecords.description,
      // substance_records has no `note` column; originalInputText is the
      // free-text the user typed and serves as the note-equivalent.
      originalInputText: substanceRecords.originalInputText,
      source: substanceRecords.source,
      sourceRecordId: substanceRecords.sourceRecordId,
      groupId: substanceRecords.groupId,
      groupSource: substanceRecords.groupSource,
      timestamp: substanceRecords.timestamp,
    })
    .from(substanceRecords)
    .where(
      and(
        eq(substanceRecords.userId, userId),
        gte(substanceRecords.timestamp, range.start),
        lte(substanceRecords.timestamp, range.end),
        isNull(substanceRecords.deletedAt),
        ...(typeFilter ? [typeFilter] : []),
      ),
    )
    .orderBy(desc(substanceRecords.timestamp), desc(substanceRecords.id))
    .limit(MAX_ROWS + 1);
  return capRows(rows);
}

// ─────────────────────────────────────────────────────────────────────────
// Medication queries
// ─────────────────────────────────────────────────────────────────────────

export async function listMedications(userId: string) {
  const { presc, effective } = await loadEffectiveRegimen(userId);
  const byPrescription = new Map(effective.map((e) => [e.prescriptionId, e]));

  // One phase per prescription: while a titration plan runs, its titration
  // phase overrides the still-active maintenance phase, as in the app's
  // schedule. Listing both would read as two concurrent regimens.
  return {
    medications: presc.map(({ createdAt: _createdAt, ...p }) => {
      const e = byPrescription.get(p.id);
      if (!e) return { ...p, phase: null };
      const { deletedAt: _deletedAt, ...phase } = e.phase;
      return {
        ...p,
        phase: {
          ...phase,
          schedules: e.schedules.map(
            ({ deletedAt: _d, ...sched }) => sched,
          ),
        },
      };
    }),
  };
}

/**
 * The most recent dose logs. `status` follows the app's rule
 * (resolveDoseStatus): a scheduled dose still outstanding ("pending" or
 * "rescheduled") on a day before today, in the user's zone, is "missed".
 * `loggedStatus` is the status as stored.
 */
export async function listRecentDoses(
  userId: string,
  limit: number,
  opts: { timezone?: string | undefined; now?: number } = {},
) {
  const storedTz = opts.timezone
    ? null
    : await getStoredTimeZone(userId, await getSyncedSettings(userId));
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(opts.timezone, storedTz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(opts.now ?? Date.now());
  const cap = Math.min(Math.max(limit, 1), 500);
  const rows = await db
    .select({
      id: doseLogs.id,
      prescriptionId: doseLogs.prescriptionId,
      kind: doseLogs.kind,
      phaseId: doseLogs.phaseId,
      scheduleId: doseLogs.scheduleId,
      inventoryItemId: doseLogs.inventoryItemId,
      scheduledDate: doseLogs.scheduledDate,
      scheduledTime: doseLogs.scheduledTime,
      status: doseLogs.status,
      actionTimestamp: doseLogs.actionTimestamp,
      skipReason: doseLogs.skipReason,
      note: doseLogs.note,
      // What was taken. The snapshot (frozen at log time) wins; doseMg is a
      // PRN dose's explicit amount; the schedule's current dosage is the
      // fallback for older scheduled logs without a snapshot.
      doseAmount: doseLogs.doseAmount,
      doseUnit: doseLogs.doseUnit,
      pillsConsumed: doseLogs.pillsConsumed,
      pillStrength: doseLogs.pillStrength,
      doseMg: doseLogs.doseMg,
      scheduleDosage: phaseSchedules.dosage,
      scheduleUnit: phaseSchedules.unit,
      genericName: prescriptions.genericName,
      // Three-state: null = prescription hard-deleted (no matching row),
      // true = soft-deleted (archived), false = live. A bare
      // `deletedAt IS NOT NULL` would wrongly report a hard-gone (unmatched
      // left-join) prescription as false/live, since NULL IS NOT NULL = FALSE.
      archived: sql<
        boolean | null
      >`CASE WHEN ${prescriptions.id} IS NULL THEN NULL ELSE (${prescriptions.deletedAt} IS NOT NULL) END`,
    })
    .from(doseLogs)
    // Resolve the name even for a SOFT-deleted prescription — historic doses
    // referencing an archived prescription should still show its name. Keep the
    // userId scope so a dose can never resolve to another user's name.
    .leftJoin(
      prescriptions,
      and(
        eq(doseLogs.prescriptionId, prescriptions.id),
        eq(prescriptions.userId, userId),
      ),
    )
    .leftJoin(
      phaseSchedules,
      and(
        eq(doseLogs.scheduleId, phaseSchedules.id),
        eq(phaseSchedules.userId, userId),
      ),
    )
    .where(and(eq(doseLogs.userId, userId), isNull(doseLogs.deletedAt)))
    // Unactioned (pending) logs have no actionTimestamp; keep them after the
    // actioned ones instead of Postgres' default NULLS FIRST for DESC.
    .orderBy(sql`${doseLogs.actionTimestamp} DESC NULLS LAST`, desc(doseLogs.id))
    .limit(cap);
  return {
    doses: rows.map(({ status, ...row }) => ({
      ...row,
      status:
        row.kind === "prn" ? status : resolveDoseStatus(status, row.scheduledDate, todayKey),
      loggedStatus: status,
    })),
  };
}

export async function getInventoryStatus(userId: string) {
  const rows = await db
    .select({
      id: inventoryItems.id,
      prescriptionId: inventoryItems.prescriptionId,
      brandName: inventoryItems.brandName,
      // Authoritative stock = signed SUM of this item's non-deleted inventory
      // transactions (amounts are already signed: refill/initial positive,
      // consumed negative, adjustments either way — mirrors getCurrentStock in
      // inventory-service). Amounts are fractional (half tablets), so sum in
      // double precision and round to 4 dp like the app — an ::int cast
      // rounded 0.5 to 0 (half-even). SUM over ZERO rows is NULL, so a legacy item with no
      // transactions falls through to the deprecated currentStock, then 0. An
      // item whose transactions net to zero yields SUM=0 and correctly reports
      // 0 (a real balance). Negative stock is legal (over-consumed) — no clamp.
      stock: sql<number>`COALESCE(
        (SELECT ROUND(SUM(${inventoryTransactions.amount}::double precision)::numeric, 4)::double precision
           FROM ${inventoryTransactions}
          WHERE ${inventoryTransactions.inventoryItemId} = ${inventoryItems.id}
            AND ${inventoryTransactions.userId} = ${userId}
            AND ${inventoryTransactions.deletedAt} IS NULL),
        ${inventoryItems.currentStock}::double precision,
        0
      )`.mapWith(Number),
      strength: inventoryItems.strength,
      unit: inventoryItems.unit,
      compounds: inventoryItems.compounds,
      refillAlertPills: inventoryItems.refillAlertPills,
      refillAlertDays: inventoryItems.refillAlertDays,
      isActive: inventoryItems.isActive,
      genericName: prescriptions.genericName,
    })
    .from(inventoryItems)
    .leftJoin(
      prescriptions,
      and(
        eq(inventoryItems.prescriptionId, prescriptions.id),
        eq(prescriptions.userId, userId),
        isNull(prescriptions.deletedAt),
      ),
    )
    .where(
      and(
        eq(inventoryItems.userId, userId),
        eq(inventoryItems.isActive, true),
        isNull(inventoryItems.deletedAt),
      ),
    );
  return { inventory: rows };
}

// ─────────────────────────────────────────────────────────────────────────
// Elimination + titration queries
// ─────────────────────────────────────────────────────────────────────────

export async function queryUrinationHistory(userId: string, range: DateRange) {
  const rows = await db
    .select({
      id: urinationRecords.id,
      timestamp: urinationRecords.timestamp,
      // Free-text volume category (e.g. 'small' | 'normal' | 'large'), nullable.
      amountEstimate: urinationRecords.amountEstimate,
      note: urinationRecords.note,
    })
    .from(urinationRecords)
    .where(
      and(
        eq(urinationRecords.userId, userId),
        gte(urinationRecords.timestamp, range.start),
        lte(urinationRecords.timestamp, range.end),
        isNull(urinationRecords.deletedAt),
      ),
    )
    .orderBy(desc(urinationRecords.timestamp), desc(urinationRecords.id))
    .limit(MAX_ROWS + 1);
  return capRows(rows);
}

export async function listTitrationPlans(userId: string) {
  const plans = await db
    .select({
      id: titrationPlans.id,
      title: titrationPlans.title,
      conditionLabel: titrationPlans.conditionLabel,
      recommendedStartDate: titrationPlans.recommendedStartDate,
      status: titrationPlans.status,
      notes: titrationPlans.notes,
      warnings: titrationPlans.warnings,
    })
    .from(titrationPlans)
    .where(and(eq(titrationPlans.userId, userId), isNull(titrationPlans.deletedAt)))
    .orderBy(desc(titrationPlans.updatedAt));
  return { titration_plans: plans };
}

// ─────────────────────────────────────────────────────────────────────────

/**
 * Takes up to MAX_ROWS + 1 rows fetched NEWEST first, keeps the newest
 * MAX_ROWS and returns them oldest first.
 */
function capRows<T>(rowsNewestFirst: T[]): { items: T[]; truncated: boolean } {
  const truncated = rowsNewestFirst.length > MAX_ROWS;
  const kept = truncated ? rowsNewestFirst.slice(0, MAX_ROWS) : rowsNewestFirst;
  return { items: kept.reverse(), truncated };
}

// Silence unused-warning for `notDeleted` (kept as a documented helper for
// future tools that want a typed predicate; not used internally because
// every call site spells out `isNull(table.deletedAt)` explicitly).
void notDeleted;
