/**
 * Drizzle writes that back the MCP log tools.
 *
 * The connector writes straight to the server mirror of the Dexie tables.
 * Each row gets a fresh `serverUpdatedAt`, so the app's next pull (on start,
 * on focus, when the device comes online) brings it down like a row another
 * device pushed. The rows have the same shape as the app's own: a meal is an
 * eating record with its water content and solutes in one group (as
 * `addComposableEntry` writes it), a drink is the water row with its solutes
 * and caffeine/alcohol in one group (as `logDrink` writes it).
 *
 * Every write is user-scoped by the caller's verified userId, and the rows of
 * one entry go in atomically. The connector can only remove entries it made
 * itself (groupSource starting `mcp_`), never the user's own.
 */
import { and, eq, isNull, like } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@intake/db/client";
import {
  eatingRecords,
  intakeRecords,
  substanceRecords,
} from "@intake/db/schema";
import { standardDrinksFromAbv } from "@intake/core/alcohol";
import { getUserTimeZone } from "@/lib/mcp/queries";

/** groupSource of every entry the connector writes; delete is limited to these. */
export const MCP_GROUP_SOURCE_PREFIX = "mcp_";
export const MCP_FOOD_GROUP_SOURCE = "mcp_food";
export const MCP_DRINK_GROUP_SOURCE = "mcp_drink";

/** deviceId on connector rows: no device wrote them. */
export const MCP_DEVICE_ID = "mcp-connector";

// The intake `source` values the app's own meal and drink paths use, so a
// connector entry reads and edits like one logged by hand.
const WATER_CONTENT_SOURCE = "manual:food_water_content";
const DRINK_WATER_SOURCE = "drink";
const SODIUM_SOURCE = "manual:sodium";
const SUGAR_SOURCE = "manual:sugar";
const POTASSIUM_SOURCE = "manual:potassium";

/** Precision of the stored `amountStandardDrinks`, as in drink-service. */
const STANDARD_DRINKS_DP = 2;

interface Solutes {
  sodiumMg?: number | undefined;
  sugarG?: number | undefined;
  potassiumMg?: number | undefined;
}

export interface LogFoodInput extends Solutes {
  description: string;
  grams?: number | undefined;
  waterMl?: number | undefined;
  timestamp: number;
  timezone?: string | undefined;
}

export interface LogDrinkInput extends Solutes {
  description: string;
  volumeMl: number;
  caffeineMg?: number | undefined;
  abvPercent?: number | undefined;
  timestamp: number;
  timezone?: string | undefined;
}

export interface LoggedEntry {
  group_id: string;
  timestamp: number;
  timezone: string;
  /** What was stored, in the stored units (sodium mg, not salt). */
  logged: Record<string, number | string>;
}

/**
 * Intake columns are Postgres integers. Round first, then drop a value that
 * rounds to nothing, so no row records none of its solute.
 */
function whole(value: number | undefined): number {
  return value !== undefined ? Math.round(value) : 0;
}

function rowFields(userId: string, timestamp: number, timezone: string, now: number) {
  return {
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

type IntakeInsert = typeof intakeRecords.$inferInsert;

function soluteRows(
  solutes: Solutes,
  base: ReturnType<typeof rowFields> & { groupId: string; groupSource: string },
  note: string,
): IntakeInsert[] {
  const candidates = [
    { type: "salt", amount: whole(solutes.sodiumMg), source: SODIUM_SOURCE },
    { type: "sugar", amount: whole(solutes.sugarG), source: SUGAR_SOURCE },
    { type: "potassium", amount: whole(solutes.potassiumMg), source: POTASSIUM_SOURCE },
  ] as const;
  return candidates
    .filter((c) => c.amount > 0)
    .map((c) => ({
      id: crypto.randomUUID(),
      type: c.type,
      amount: c.amount,
      source: c.source,
      note,
      ...base,
    }));
}

function loggedSolutes(rows: Array<{ type: string; amount: number }>) {
  const names: Record<string, string> = {
    salt: "sodium_mg",
    sugar: "sugar_g",
    potassium: "potassium_mg",
  };
  return Object.fromEntries(
    rows.filter((r) => names[r.type]).map((r) => [names[r.type]!, r.amount]),
  );
}

type Executor = Pick<typeof db, "insert" | "update">;
type Query = Parameters<typeof db.batch>[0][number];

/**
 * Run the statements of one entry together: a batch on the Neon HTTP driver
 * (one implicit transaction), a transaction on a pooled driver (tests).
 * `build` makes the statements against the executor that runs them.
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

/** Log a meal: what the user ate, with the nutrients of that portion. */
export async function logFood(
  userId: string,
  input: LogFoodInput,
  now = Date.now(),
): Promise<LoggedEntry> {
  const timezone = await getUserTimeZone(userId, input.timezone);
  const groupId = crypto.randomUUID();
  const groupSource = MCP_FOOD_GROUP_SOURCE;
  const base = { ...rowFields(userId, input.timestamp, timezone, now), groupId, groupSource };
  const note = input.description.trim();
  const grams = whole(input.grams);
  const waterMl = whole(input.waterMl);

  const eating = {
    id: crypto.randomUUID(),
    note,
    ...(grams > 0 && { grams }),
    ...base,
  };
  const intakes = soluteRows(input, base, note);
  if (waterMl > 0) {
    intakes.push({
      id: crypto.randomUUID(),
      type: "water",
      amount: waterMl,
      source: WATER_CONTENT_SOURCE,
      note,
      ...base,
    });
  }

  await runAtomically((exec) => [
    exec.insert(eatingRecords).values(eating),
    ...(intakes.length > 0 ? [exec.insert(intakeRecords).values(intakes)] : []),
  ]);

  return {
    group_id: groupId,
    timestamp: input.timestamp,
    timezone,
    logged: {
      description: note,
      ...(grams > 0 && { grams }),
      ...(waterMl > 0 && { water_ml: waterMl }),
      ...loggedSolutes(intakes),
    },
  };
}

/** Log a drink: its full volume as fluid, plus solutes, caffeine and alcohol. */
export async function logDrink(
  userId: string,
  input: LogDrinkInput,
  now = Date.now(),
): Promise<LoggedEntry> {
  const timezone = await getUserTimeZone(userId, input.timezone);
  const groupId = crypto.randomUUID();
  const groupSource = MCP_DRINK_GROUP_SOURCE;
  const base = { ...rowFields(userId, input.timestamp, timezone, now), groupId, groupSource };
  const description = input.description.trim();
  const volumeMl = Math.max(1, whole(input.volumeMl));

  const intakes: IntakeInsert[] = [
    {
      id: crypto.randomUUID(),
      type: "water",
      amount: volumeMl,
      source: DRINK_WATER_SOURCE,
      note: description,
      ...base,
    },
    ...soluteRows(input, base, description),
  ];

  const substance = {
    description,
    volumeMl,
    source: "standalone",
    aiEnriched: false,
    ...base,
  };
  const substances: Array<typeof substanceRecords.$inferInsert> = [];
  const caffeineMg = whole(input.caffeineMg);
  if (caffeineMg > 0) {
    substances.push({ id: crypto.randomUUID(), type: "caffeine", amountMg: caffeineMg, ...substance });
  }
  const abvPercent = input.abvPercent ?? 0;
  const standardDrinks =
    abvPercent > 0
      ? parseFloat(standardDrinksFromAbv(abvPercent, volumeMl).toFixed(STANDARD_DRINKS_DP))
      : 0;
  if (abvPercent > 0) {
    substances.push({
      id: crypto.randomUUID(),
      type: "alcohol",
      abvPercent,
      amountStandardDrinks: standardDrinks,
      ...substance,
    });
  }

  await runAtomically((exec) => [
    exec.insert(intakeRecords).values(intakes),
    ...(substances.length > 0 ? [exec.insert(substanceRecords).values(substances)] : []),
  ]);

  return {
    group_id: groupId,
    timestamp: input.timestamp,
    timezone,
    logged: {
      description,
      volume_ml: volumeMl,
      ...loggedSolutes(intakes),
      ...(caffeineMg > 0 && { caffeine_mg: caffeineMg }),
      ...(abvPercent > 0 && { abv_percent: abvPercent, standard_drinks: standardDrinks }),
    },
  };
}

const ENTRY_TABLES = [eatingRecords, intakeRecords, substanceRecords] as const;

type EntryTable = (typeof ENTRY_TABLES)[number];

function liveGroupRows(table: EntryTable, userId: string, groupId: string) {
  return and(
    eq(table.userId, userId),
    eq(table.groupId, groupId),
    isNull(table.deletedAt),
  );
}

export type DeleteResult =
  | { deleted: true; group_id: string; rows: number }
  | { deleted: false; reason: "not_found" | "not_connector_entry" };

/**
 * Remove one entry the connector logged: tombstone every live row of its
 * group, so the app drops it on the next pull. An entry the user logged in
 * the app is refused — only the user removes those.
 */
export async function deleteLoggedEntry(
  userId: string,
  groupId: string,
  now = Date.now(),
): Promise<DeleteResult> {
  const found = await Promise.all(
    ENTRY_TABLES.map((table) =>
      db
        .select({ groupSource: table.groupSource })
        .from(table as PgTable & EntryTable)
        .where(liveGroupRows(table, userId, groupId)),
    ),
  );
  const rows = found.flat();
  if (rows.length === 0) return { deleted: false, reason: "not_found" };
  if (rows.some((r) => !r.groupSource?.startsWith(MCP_GROUP_SOURCE_PREFIX))) {
    return { deleted: false, reason: "not_connector_entry" };
  }

  const tombstone = { deletedAt: now, updatedAt: now, serverUpdatedAt: now };
  await runAtomically((exec) =>
    ENTRY_TABLES.map((table) =>
      exec
        .update(table)
        .set(tombstone)
        .where(
          and(
            liveGroupRows(table, userId, groupId),
            like(table.groupSource, `${MCP_GROUP_SOURCE_PREFIX}%`),
          ),
        ),
    ),
  );
  return { deleted: true, group_id: groupId, rows: rows.length };
}
