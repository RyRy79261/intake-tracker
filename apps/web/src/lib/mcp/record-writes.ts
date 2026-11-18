/**
 * Drizzle writes behind the MCP tools that log one reading or one journal
 * entry: sodium, weight, blood pressure, urination, defecation and the
 * medical journal.
 *
 * Same rules as ./writes.ts: rows go straight to the server mirror of the
 * Dexie tables, user-scoped, with `deviceId = MCP_DEVICE_ID` and a fresh
 * `serverUpdatedAt`, so the app's next pull brings them down like a row
 * another device pushed. Each row has the shape the app's own add path writes
 * (health-service, estimate-tracker-service, intake-service, journal-service).
 * `source` stays unset: it only says "manual" form or "voice".
 *
 * Journal text is encrypted before it is stored, exactly as the sync push
 * route does (lib/server/field-vault.ts).
 *
 * The connector removes only rows it made itself (`deviceId` is
 * MCP_DEVICE_ID), never the user's own.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@intake/db/client";
import {
  bloodPressureRecords,
  defecationRecords,
  intakeRecords,
  journalEntries,
  prescriptions,
  urinationRecords,
  weightRecords,
} from "@intake/db/schema";
import type { JournalEntryKind, JournalTimePrecision, SodiumSource, SodiumSourceUnit } from "@intake/types/records";
import { toSodiumMg } from "@intake/core/sodium";
import {
  JOURNAL_FINDING_MAX,
  isBloodThinner,
  isPlaceId,
  isPlaceMissingSide,
  journalNotices,
  placeLabel,
  titleFromWords,
  type JournalNotice,
} from "@intake/core/journal";
import { BLANK_WHEN_DELETED, encryptRowFields } from "@/lib/server/field-vault";
import { getUserTimeZone } from "@/lib/mcp/queries";
import { MCP_DEVICE_ID } from "@/lib/mcp/writes";

/** The intake `source` of a sodium row added on its own, as the Food card writes it. */
const SODIUM_SOURCE = "manual:sodium";

interface Timed {
  timestamp: number;
  timezone?: string | undefined;
}

function rowFields(userId: string, timestamp: number, timezone: string, now: number) {
  return {
    id: crypto.randomUUID(),
    userId,
    timestamp,
    timezone,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: MCP_DEVICE_ID,
    serverUpdatedAt: now,
  };
}

const trimmed = (text: string | undefined) => {
  const t = text?.trim();
  return t ? t : undefined;
};

export interface LoggedRecord {
  /** Pass to delete_logged_record with the same kind to undo. */
  id: string;
  kind: RecordKind;
  timestamp: number;
  timezone: string;
  logged: Record<string, unknown>;
}

// ─── Sodium ───────────────────────────────────────────────────────────

export interface LogSodiumInput extends Timed {
  amount: number;
  unit: SodiumSourceUnit;
  /** What the user added: sodium itself, table salt or MSG. */
  source: SodiumSource;
  note?: string | undefined;
}

/** A sodium intake row in mg, keeping what the user said they added. */
export async function logSodium(userId: string, input: LogSodiumInput, now = Date.now()): Promise<LoggedRecord> {
  const timezone = await getUserTimeZone(userId, input.timezone);
  const base = rowFields(userId, input.timestamp, timezone, now);
  const sodiumMg = Math.max(1, Math.round(toSodiumMg(input.amount, input.unit, input.source)));
  const note = trimmed(input.note);
  await db.insert(intakeRecords).values({
    ...base,
    type: "salt",
    amount: sodiumMg,
    source: SODIUM_SOURCE,
    sodiumSource: input.source,
    sourceAmount: input.amount,
    sourceUnit: input.unit,
    ...(note && { note }),
  });
  return {
    id: base.id,
    kind: "sodium",
    timestamp: input.timestamp,
    timezone,
    logged: { sodium_mg: sodiumMg, entered: `${input.amount} ${input.unit} ${input.source}`, ...(note && { note }) },
  };
}

// ─── Weight and blood pressure ────────────────────────────────────────

export interface LogWeightInput extends Timed {
  weightKg: number;
  note?: string | undefined;
}

export async function logWeight(userId: string, input: LogWeightInput, now = Date.now()): Promise<LoggedRecord> {
  const timezone = await getUserTimeZone(userId, input.timezone);
  const base = rowFields(userId, input.timestamp, timezone, now);
  const note = trimmed(input.note);
  await db.insert(weightRecords).values({ ...base, weight: input.weightKg, ...(note && { note }) });
  return {
    id: base.id,
    kind: "weight",
    timestamp: input.timestamp,
    timezone,
    logged: { weight_kg: input.weightKg, ...(note && { note }) },
  };
}

export interface LogBloodPressureInput extends Timed {
  systolic: number;
  diastolic: number;
  heartRate?: number | undefined;
  irregularHeartbeat?: boolean | undefined;
  position?: "sitting" | "standing" | undefined;
  arm?: "left" | "right" | undefined;
  note?: string | undefined;
}

/** Position and arm default as in the app's add path: sitting, left arm. */
export async function logBloodPressure(
  userId: string,
  input: LogBloodPressureInput,
  now = Date.now(),
): Promise<LoggedRecord> {
  const timezone = await getUserTimeZone(userId, input.timezone);
  const base = rowFields(userId, input.timestamp, timezone, now);
  const note = trimmed(input.note);
  const reading = {
    systolic: input.systolic,
    diastolic: input.diastolic,
    position: input.position ?? "sitting",
    arm: input.arm ?? "left",
    ...(input.heartRate !== undefined && { heartRate: input.heartRate }),
    ...(input.irregularHeartbeat !== undefined && { irregularHeartbeat: input.irregularHeartbeat }),
  };
  await db.insert(bloodPressureRecords).values({ ...base, ...reading, ...(note && { note }) });
  return { id: base.id, kind: "blood_pressure", timestamp: input.timestamp, timezone, logged: { ...reading, ...(note && { note }) } };
}

// ─── Urination and defecation ─────────────────────────────────────────

export interface LogEstimateInput extends Timed {
  amountEstimate?: "small" | "medium" | "large" | undefined;
  note?: string | undefined;
}

export async function logEstimate(
  userId: string,
  kind: "urination" | "defecation",
  input: LogEstimateInput,
  now = Date.now(),
): Promise<LoggedRecord> {
  const timezone = await getUserTimeZone(userId, input.timezone);
  const base = rowFields(userId, input.timestamp, timezone, now);
  const note = trimmed(input.note);
  const fields = {
    ...(input.amountEstimate && { amountEstimate: input.amountEstimate }),
    ...(note && { note }),
  };
  await db.insert(kind === "urination" ? urinationRecords : defecationRecords).values({ ...base, ...fields });
  return { id: base.id, kind, timestamp: input.timestamp, timezone, logged: fields };
}

// ─── Journal ──────────────────────────────────────────────────────────

export interface AddJournalInput extends Timed {
  words: string;
  finding?: string | undefined;
  kind: JournalEntryKind;
  places?: readonly string[] | undefined;
  severity?: number | null | undefined;
  timePrecision?: JournalTimePrecision | undefined;
}

export type AddJournalResult =
  | (LoggedRecord & { notices: JournalNotice[] })
  | { added: false; message: string };

/** The user's active medicines include an anticoagulant or antiplatelet. */
async function onBloodThinners(userId: string): Promise<boolean> {
  const rows = await db
    .select({ genericName: prescriptions.genericName })
    .from(prescriptions)
    .where(and(eq(prescriptions.userId, userId), eq(prescriptions.isActive, true), isNull(prescriptions.deletedAt)));
  return rows.some((r) => isBloodThinner(r.genericName));
}

/**
 * A journal entry as journal-service's buildJournalEntry makes it: the title
 * falls back to the start of the words, places must be known ids with a side
 * where one is needed. Returns the safety notices the app shows before saving
 * (they never block it), so the model can pass them on.
 */
export async function addJournalEntry(
  userId: string,
  input: AddJournalInput,
  now = Date.now(),
): Promise<AddJournalResult> {
  const words = input.words.trim();
  const places = [...new Set(input.places ?? [])];
  const missingSide = places.find(isPlaceMissingSide);
  if (missingSide) {
    return { added: false, message: `Ask the user which side for "${placeLabel(missingSide)}" and pass "${missingSide}-l" or "${missingSide}-r".` };
  }
  const unknown = places.find((p) => !isPlaceId(p));
  if (unknown) return { added: false, message: `"${unknown}" is not a body place id. Use one from the tool description.` };

  const finding = (input.finding?.trim() || titleFromWords(words)).slice(0, JOURNAL_FINDING_MAX);
  const severity = input.severity ?? null;
  // Read before the insert: a failure here must not leave a saved entry
  // reported as failed (a retry would add it twice).
  const notices = journalNotices({ finding, words, severity, places }, { onBloodThinners: await onBloodThinners(userId) });
  const timezone = await getUserTimeZone(userId, input.timezone);
  const base = rowFields(userId, input.timestamp, timezone, now);
  const row = {
    ...base,
    timePrecision: input.timePrecision ?? "exact",
    words,
    finding,
    kind: input.kind,
    places,
    severity,
  };
  await db.insert(journalEntries).values(encryptRowFields("journalEntries", row, userId));
  return {
    id: base.id,
    kind: "journal_entry",
    timestamp: input.timestamp,
    timezone,
    logged: { finding, kind: input.kind, places: places.map(placeLabel), severity, time_precision: row.timePrecision },
    notices,
  };
}

// ─── Delete ───────────────────────────────────────────────────────────

const RECORD_TABLES = {
  sodium: intakeRecords,
  weight: weightRecords,
  blood_pressure: bloodPressureRecords,
  urination: urinationRecords,
  defecation: defecationRecords,
  journal_entry: journalEntries,
} as const;

export type RecordKind = keyof typeof RECORD_TABLES;
export const RECORD_KINDS = Object.keys(RECORD_TABLES) as RecordKind[];

export type DeleteRecordResult =
  | { deleted: true; kind: string; id: string }
  | { deleted: false; reason: "not_found" | "not_connector_entry" };

/**
 * Tombstone one row the connector logged. A deleted journal entry keeps no
 * text, as on the device (BLANK_WHEN_DELETED).
 */
export async function deleteLoggedRecord(
  userId: string,
  kind: RecordKind,
  id: string,
  now = Date.now(),
): Promise<DeleteRecordResult> {
  const table = RECORD_TABLES[kind];
  // A sodium id is a standalone sodium row: a meal's or drink's intake row
  // goes with its group (delete_logged_entry), never on its own.
  const sodiumOnly =
    kind === "sodium" ? [eq(intakeRecords.type, "salt"), isNull(intakeRecords.groupId)] : [];
  const live = and(eq(table.userId, userId), eq(table.id, id), isNull(table.deletedAt), ...sodiumOnly);
  const [row] = await db.select({ deviceId: table.deviceId }).from(table).where(live).limit(1);
  if (!row) return { deleted: false, reason: "not_found" };
  if (row.deviceId !== MCP_DEVICE_ID) return { deleted: false, reason: "not_connector_entry" };
  const blank = kind === "journal_entry" ? BLANK_WHEN_DELETED.journalEntries : {};
  const updated = await db
    .update(table)
    .set({ ...blank, deletedAt: now, updatedAt: now, serverUpdatedAt: now })
    .where(and(live, eq(table.deviceId, MCP_DEVICE_ID)))
    .returning({ id: table.id });
  // The app pushed a change to the row between the two statements.
  if (updated.length === 0) return { deleted: false, reason: "not_connector_entry" };
  return { deleted: true, kind, id };
}
