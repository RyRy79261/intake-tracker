/**
 * MCP tool registry.
 *
 * Each tool:
 *   - validates its input with Zod (date-range sanity, etc.)
 *   - extracts userId from ctx.http.authInfo (set by withMcpAuth → verifyToken)
 *   - calls a query function in ./queries, or a write in ./writes
 *   - writes an audit log row (fire-and-forget)
 *   - returns a `content: [{ type: "text", text: JSON }]` MCP response
 *
 * The read tools need the `intake-tracker:read` scope and the log tools the
 * `intake-tracker:write` scope, both granted on the consent screen; a token
 * granted before the write scope existed is refused with a message to
 * reconnect. The log tools add meals and drinks and remove only
 * entries the connector itself logged — nothing else can be changed.
 */
import { z } from "zod";
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import {
  getInventoryStatus,
  getTodaySummary,
  listMedications,
  listRecentDoses,
  listTitrationPlans,
  queryBloodPressureHistory,
  queryEatingHistory,
  queryIntakeHistory,
  querySubstanceHistory,
  queryUrinationHistory,
  queryWeightHistory,
} from "@/lib/mcp/queries";
import { deleteLoggedEntry, logDrink, logFood } from "@/lib/mcp/writes";
import { writeMcpAudit } from "@/lib/mcp/audit";
import { isValidTimeZone } from "@/lib/mcp/day-window";
import { READ_SCOPE, WRITE_SCOPE } from "@/lib/mcp/scopes";
import type { McpReadToolName, McpWriteToolName } from "@/lib/mcp/tool-catalog";
import { VOICE_ITEM_SPEC } from "@intake/core/voice-items";
import { isFutureTimestamp } from "@intake/core/record-schemas";

const ONE_YEAR_MS = 365 * 24 * 60 * 60_000;

const rangeShape = {
  start_ms: z
    .number()
    .int()
    .nonnegative()
    .describe("Range start, unix milliseconds"),
  end_ms: z
    .number()
    .int()
    .nonnegative()
    .describe("Range end, unix milliseconds"),
};

// Range limits live in the schema, so the SDK rejects a bad range before the
// tool runs and returns the message below to the model verbatim (a throw
// inside runTool would be masked as a generic internal error).
type RangeArgs = { start_ms: number; end_ms: number };

function withRange<S extends z.ZodRawShape>(shape: S) {
  return z
    .object({ ...shape, ...rangeShape })
    .refine((a) => (a as RangeArgs).end_ms >= (a as RangeArgs).start_ms, {
      message: "end_ms must be >= start_ms",
      path: ["end_ms"],
    })
    .refine((a) => (a as RangeArgs).end_ms - (a as RangeArgs).start_ms <= ONE_YEAR_MS, {
      message:
        "Range must be <= 1 year (365 days); split longer periods into several calls",
      path: ["end_ms"],
    });
}

const dateRange = withRange({});

const timezoneArg = z
  .string()
  .refine(isValidTimeZone, {
    message: "timezone must be an IANA time zone such as 'Europe/Berlin'",
  })
  .optional()
  .describe(
    "The user's IANA time zone (e.g. 'Europe/Berlin'). Defaults to the zone the app last reported for the user, else UTC.",
  );

function getAuth(ctx: ServerContext): {
  userId: string;
  clientId: string;
  scopes: string[];
} {
  const info = ctx.http?.authInfo;
  if (!info?.extra || typeof info.extra !== "object") {
    throw new Error("Missing auth context");
  }
  const extra = info.extra as { userId?: string; clientId?: string };
  if (!extra.userId || !extra.clientId) {
    throw new Error("Missing userId/clientId in auth context");
  }
  return { userId: extra.userId, clientId: extra.clientId, scopes: info.scopes ?? [] };
}

async function runTool<TArgs extends Record<string, unknown>>(
  ctx: ServerContext,
  tool: string,
  args: TArgs,
  argsForAudit: Record<string, unknown> | null,
  body: (userId: string) => Promise<unknown>,
  opts: { write?: boolean } = {},
) {
  const started = Date.now();
  const { userId, clientId, scopes } = getAuth(ctx);
  // Each tool needs its own scope: a write-only grant must not read.
  const required = opts.write ? WRITE_SCOPE : READ_SCOPE;
  if (!scopes.includes(required)) {
    void writeMcpAudit({
      userId,
      clientId,
      tool,
      argsForAudit,
      status: "error",
      errorMessage: `missing ${required} scope`,
      durationMs: Date.now() - started,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: opts.write
            ? "This connection can only read. To let Claude log entries, remove the intake-tracker connector in Claude's settings and connect it again, then approve the new access."
            : "This connection was not granted read access to intake-tracker data.",
        },
      ],
      isError: true,
    };
  }
  try {
    const result = await body(userId);
    void writeMcpAudit({
      userId,
      clientId,
      tool,
      argsForAudit,
      status: "success",
      durationMs: Date.now() - started,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Full internal error is captured in the audit log only. The reply
    // to the MCP client is intentionally generic so we don't leak SQL
    // shapes, stack frames, or internal field names to the model.
    void writeMcpAudit({
      userId,
      clientId,
      tool,
      argsForAudit,
      status: "error",
      errorMessage: message,
      durationMs: Date.now() - started,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: "An internal error occurred while processing your request.",
        },
      ],
      isError: true,
    };
  }
}

export function registerReadOnlyTools(server: McpServer): void {
  // Names are typed against the consent catalog, so every tool registered
  // here is one the OAuth consent screen describes.
  const tool = (name: McpReadToolName) => name;

  server.registerTool(
    tool("get_today_summary"),
    {
      title: "Today's summary",
      description:
        "Today so far, in the user's time zone. `intake` holds totals since the user's day-start hour: water_ml, sodium_mg (sodium, not table salt: 1 g salt is about 393 mg sodium, 1 g MSG about 123 mg), sugar_g and potassium_mg. Also the latest blood-pressure and weight readings. `doses` covers today's local calendar date (`scheduled_date`): each scheduled slot of the effective regimen with its status (taken / skipped / outstanding), the counts per status, and any other dose logs for the date (as-needed doses, or logs against a slot no longer in the regimen) under `unscheduled`.",
      inputSchema: z.object({ timezone: timezoneArg }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "get_today_summary",
        args,
        { timezone: args.timezone ?? null },
        (userId) => getTodaySummary(userId, { timezone: args.timezone }),
      ),
  );

  server.registerTool(
    tool("query_intake_history"),
    {
      title: "Intake history",
      description:
        "Returns individual water/sodium/sugar/potassium intake records in the given time range. Use type='all' to combine. Sodium rows are sodium in mg (not table salt: 1 g salt is about 393 mg sodium, 1 g MSG about 123 mg); 'salt' is accepted as a legacy name for 'sodium'. A sodium row entered as salt, MSG or sodium carries what the user typed in sodiumSource ('salt' | 'msg' | 'sodium'), sourceAmount and sourceUnit ('mg' | 'g') — amount is always the converted sodium mg; those fields are null when the source is unknown (older, AI-parsed or preset rows). Each row includes groupId/groupSource, and a `substance` object when the row is the fluid half of a decomposed drink (linked by groupId, or by source='substance:<id>' for records predating that link) — carrying the linked substance's type, description, ABV %, standard drinks, and caffeine mg (null otherwise). Use query_substance_history for the full caffeine/alcohol list. Returned oldest first. Capped at 5000 rows: when `truncated` is true the NEWEST 5000 rows in the range are kept, so page further back by calling again with end_ms set just before the first row's timestamp.",
      inputSchema: withRange({
        type: z
          .enum(["water", "sodium", "salt", "sugar", "potassium", "all"])
          .describe(
            "Intake type to filter on, or 'all'. 'salt' is a legacy alias for 'sodium'.",
          ),
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "query_intake_history",
        args,
        { type: args.type, start_ms: args.start_ms, end_ms: args.end_ms },
        (userId) =>
          queryIntakeHistory(
            userId,
            args.type === "salt" ? "sodium" : args.type,
            { start: args.start_ms, end: args.end_ms },
          ),
      ),
  );

  server.registerTool(
    tool("query_weight_history"),
    {
      title: "Weight history",
      description:
        "Weight readings (kg) in the given time range. Returned oldest first. Capped at 5000 rows: when `truncated` is true the NEWEST 5000 rows in the range are kept, so page further back by calling again with end_ms set just before the first row's timestamp.",
      inputSchema: dateRange,
    },
    async (args, ctx) =>
      runTool(ctx, "query_weight_history", args, args, (userId) =>
        queryWeightHistory(userId, { start: args.start_ms, end: args.end_ms }),
      ),
  );

  server.registerTool(
    tool("query_blood_pressure_history"),
    {
      title: "Blood pressure history",
      description:
        "Systolic/diastolic/heart-rate readings in the given time range. Returned oldest first. Capped at 5000 rows: when `truncated` is true the NEWEST 5000 rows in the range are kept, so page further back by calling again with end_ms set just before the first row's timestamp.",
      inputSchema: dateRange,
    },
    async (args, ctx) =>
      runTool(ctx, "query_blood_pressure_history", args, args, (userId) =>
        queryBloodPressureHistory(userId, { start: args.start_ms, end: args.end_ms }),
      ),
  );

  server.registerTool(
    tool("query_eating_history"),
    {
      title: "Eating history",
      description:
        "Food log entries in the given time range. Each row includes groupId; use query_substance_history for the caffeine/alcohol substances (standalone drinks are not linked here). Returned oldest first. Capped at 5000 rows: when `truncated` is true the NEWEST 5000 rows in the range are kept, so page further back by calling again with end_ms set just before the first row's timestamp.",
      inputSchema: dateRange,
    },
    async (args, ctx) =>
      runTool(ctx, "query_eating_history", args, args, (userId) =>
        queryEatingHistory(userId, { start: args.start_ms, end: args.end_ms }),
      ),
  );

  server.registerTool(
    tool("query_substance_history"),
    {
      title: "Substance history (caffeine / alcohol)",
      description:
        "Caffeine and alcohol substance records in the given time range. Each row carries the amount (caffeine mg or alcohol standard drinks), ABV %, volume, free-text description, and how it was logged (source='standalone', 'water_intake', or 'eating'; groupId links it to its parent drink/food entry). This is the authoritative source for alcohol and caffeine intake — including drinks decomposed from a water or food entry that do not appear as standalone rows. Returned oldest first. Capped at 5000 rows: when `truncated` is true the NEWEST 5000 rows in the range are kept, so page further back by calling again with end_ms set just before the first row's timestamp.",
      inputSchema: withRange({
        type: z
          .enum(["caffeine", "alcohol", "all"])
          .describe("Substance type to filter on, or 'all'"),
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "query_substance_history",
        args,
        { type: args.type, start_ms: args.start_ms, end_ms: args.end_ms },
        (userId) =>
          querySubstanceHistory(userId, args.type, {
            start: args.start_ms,
            end: args.end_ms,
          }),
      ),
  );

  server.registerTool(
    tool("query_urination_history"),
    {
      title: "Urination history",
      description:
        "Urination events in the given time range, each with a free-text volume estimate (e.g. small/normal/large) — useful for diuretic-response review. Returned oldest first. Capped at 5000 rows: when `truncated` is true the NEWEST 5000 rows in the range are kept, so page further back by calling again with end_ms set just before the first row's timestamp.",
      inputSchema: dateRange,
    },
    async (args, ctx) =>
      runTool(ctx, "query_urination_history", args, args, (userId) =>
        queryUrinationHistory(userId, { start: args.start_ms, end: args.end_ms }),
      ),
  );

  server.registerTool(
    tool("list_medications"),
    {
      title: "List active medications",
      description:
        "All active prescriptions, each with its ONE effective phase (`phase`, null if none is active) and that phase's enabled schedules. While a titration plan runs, its titration phase overrides the maintenance phase, exactly as in the app's dose schedule; `titrationPlanId` names the plan. Each schedule's `time` is the canonical wall-clock HH:MM in its `anchorTimezone`; `scheduleTimeUTC` (minutes from UTC midnight) is derived from it. `dosage` is per dose, in the schedule's `unit` (or the phase's).",
      inputSchema: z.object({}),
    },
    async (_args, ctx) =>
      runTool(ctx, "list_medications", {}, null, (userId) =>
        listMedications(userId),
      ),
  );

  server.registerTool(
    tool("list_titration_plans"),
    {
      title: "Titration plans",
      description:
        "The user's medication titration plans (e.g. an 8-step GDMT up-titration) with title, condition, recommended start date, status, notes, and warnings — the clinical narrative behind phased dose changes.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) =>
      runTool(ctx, "list_titration_plans", {}, null, (userId) =>
        listTitrationPlans(userId),
      ),
  );

  server.registerTool(
    tool("list_recent_doses"),
    {
      title: "Recent doses",
      description:
        "The most recent dose log entries joined with prescription names, newest first. `status` uses the app's rule: taken / skipped, or for a dose still owed (logged as pending or rescheduled) 'pending' on today's date and 'missed' on an earlier date, in the user's time zone (a rescheduled dose stays 'pending' until 30 minutes after `remindAt`, the epoch-ms time it was moved to); `loggedStatus` is the status as stored (taken / skipped / rescheduled / pending). Only logged doses are listed: a scheduled dose on a past day with no log at all is also missed but has no row here. `kind` is 'scheduled' (logged against `phaseId`/`scheduleId`) or 'prn' (an as-needed dose with no schedule). `unlisted` is true for a medicine the user took that is not on their medication list (a paracetamol): it has no prescriptionId, and genericName is the name they gave. For the amount, prefer the snapshot frozen when the dose was logged (`doseAmount` in `doseUnit`, from `pillsConsumed` x `pillStrength`); else `doseMg` for a PRN dose; else `scheduleDosage` in `scheduleUnit` from the linked schedule as it is now. `inventoryItemId` names the stock the dose drew from. genericName resolves even for archived (soft-deleted) prescriptions; the `archived` field is true for those, false for active, and null if the prescription was hard-deleted.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe("Number of rows to return (1-500, default 50)"),
        timezone: timezoneArg,
      }),
    },
    async (args, ctx) =>
      runTool(ctx, "list_recent_doses", args, args, (userId) =>
        listRecentDoses(userId, args.limit, { timezone: args.timezone }),
      ),
  );

  server.registerTool(
    tool("get_inventory_status"),
    {
      title: "Inventory status",
      description:
        "Per-prescription pill stock and refill thresholds for active inventory items. `stock` is authoritative and can be fractional (half tablets), rounded to 4 decimals: the signed sum of the item's live inventory transactions (falling back to the legacy currentStock, then 0, when an item has no transactions). It can be negative if over-consumed. Includes strength/unit/compounds so you can do tablets-per-dose math.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) =>
      runTool(ctx, "get_inventory_status", {}, null, (userId) =>
        getInventoryStatus(userId),
      ),
  );
}

// ─── Log tools ────────────────────────────────────────────────────────

const FOOD = VOICE_ITEM_SPEC.food;
const DRINK = VOICE_ITEM_SPEC.alcohol;

function bounded(
  spec: { min: number; max: number; unit: string },
  description: string,
) {
  return z.number().min(spec.min).max(spec.max).describe(`${description} (${spec.unit})`);
}

const entryDescription = z
  .string()
  .trim()
  .min(1)
  .max(FOOD.description.maxLength)
  .describe(
    `What it was, as the user would name it in the app (max ${FOOD.description.maxLength} characters), e.g. 'Chicken laksa, 1 bowl'`,
  );

const soluteShape = {
  sodium_mg: bounded(
    FOOD.sodiumMg,
    "Sodium in the portion consumed. Sodium, not table salt: 1 g salt is about 393 mg sodium, 1 g MSG about 123 mg",
  ).optional(),
  sugar_g: bounded(FOOD.sugarG, "Sugar in the portion consumed").optional(),
  potassium_mg: bounded(FOOD.potassiumMg, "Potassium in the portion consumed").optional(),
};

const consumedAt = z
  .number()
  .int()
  .refine((ts) => !isFutureTimestamp(ts, Date.now()), {
    message: "consumed_at_ms can't be in the future",
  })
  .refine((ts) => ts >= Date.now() - ONE_YEAR_MS, {
    message: "consumed_at_ms must be within the last year",
  })
  .optional()
  .describe("When the user ate or drank it, unix milliseconds. Defaults to now.");

/** Numbers only: the free-text description never reaches the audit log. */
function auditNumbers(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).filter(([, v]) => typeof v === "number"),
  );
}

export function registerWriteTools(server: McpServer): void {
  const tool = (name: McpWriteToolName) => name;

  server.registerTool(
    tool("log_food"),
    {
      title: "Log food",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Log a meal or snack the user ate, as one food entry. Give the amounts for the portion the user actually ate, not for the whole recipe: if a recipe makes 4 servings and the user ate 1, log a quarter of the recipe's grams and nutrients. `water_ml` is the water content of the food itself (soup, stew, fruit), which counts toward the user's fluid intake; leave it out for dry food. For a drink (water, coffee, tea, juice, beer, wine), use log_drink instead, so its volume counts as fluid once. Before logging, tell the user the values you will log; call this once per meal, never twice for the same meal. Returns `group_id`; pass it to delete_logged_entry to undo a mistake. The entry appears in the app the next time the app syncs.",
      inputSchema: z.object({
        description: entryDescription,
        grams: bounded(FOOD.grams, "Weight of the portion eaten").optional(),
        water_ml: bounded(FOOD.waterMl, "Water content of the portion eaten").optional(),
        ...soluteShape,
        consumed_at_ms: consumedAt,
        timezone: timezoneArg,
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "log_food",
        args,
        auditNumbers(args),
        (userId) =>
          logFood(userId, {
            description: args.description,
            grams: args.grams,
            waterMl: args.water_ml,
            sodiumMg: args.sodium_mg,
            sugarG: args.sugar_g,
            potassiumMg: args.potassium_mg,
            timestamp: args.consumed_at_ms ?? Date.now(),
            timezone: args.timezone,
          }),
        { write: true },
      ),
  );

  server.registerTool(
    tool("log_drink"),
    {
      title: "Log drink",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      description:
        "Log a drink the user had. `volume_ml` is the amount drunk; all of it counts as fluid intake. Add caffeine (mg) for coffee, tea, energy drinks; add `abv_percent` (the number on the label) for alcohol, and the app works out the standard drinks. Give sodium, sugar and potassium for the volume drunk. Before logging, tell the user the values you will log; call this once per drink. Returns `group_id`; pass it to delete_logged_entry to undo a mistake. The entry appears in the app the next time the app syncs.",
      inputSchema: z.object({
        description: entryDescription,
        volume_ml: bounded(DRINK.volumeMl, "Volume drunk"),
        caffeine_mg: bounded(VOICE_ITEM_SPEC.caffeine.caffeineMg, "Caffeine in the volume drunk").optional(),
        abv_percent: bounded(DRINK.abvPercent, "Alcohol by volume").optional(),
        ...soluteShape,
        consumed_at_ms: consumedAt,
        timezone: timezoneArg,
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "log_drink",
        args,
        auditNumbers(args),
        (userId) =>
          logDrink(userId, {
            description: args.description,
            volumeMl: args.volume_ml,
            caffeineMg: args.caffeine_mg,
            abvPercent: args.abv_percent,
            sodiumMg: args.sodium_mg,
            sugarG: args.sugar_g,
            potassiumMg: args.potassium_mg,
            timestamp: args.consumed_at_ms ?? Date.now(),
            timezone: args.timezone,
          }),
        { write: true },
      ),
  );

  server.registerTool(
    tool("delete_logged_entry"),
    {
      title: "Delete a logged entry",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      description:
        "Remove a meal or drink that this connector logged, by the `group_id` that log_food or log_drink returned. Use it to undo a wrong or duplicate entry, and only when the user asks. Entries the user logged in the app can't be removed here; the user removes those in the app.",
      inputSchema: z.object({
        group_id: z.string().uuid().describe("The group_id returned by log_food or log_drink"),
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "delete_logged_entry",
        args,
        { group_id: args.group_id },
        async (userId) => {
          const result = await deleteLoggedEntry(userId, args.group_id);
          if (result.deleted) return result;
          return {
            ...result,
            message:
              result.reason === "not_found"
                ? "No live entry has this group_id. It may already be deleted."
                : "This entry was logged in the app, not by Claude. The user can remove it in the app.",
          };
        },
        { write: true },
      ),
  );
}
