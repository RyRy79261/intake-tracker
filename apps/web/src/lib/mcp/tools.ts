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
import type { McpServer } from "@modelcontextprotocol/server";
import {
  getInventoryStatus,
  getProfile,
  getTodaySummary,
  listInsightReports,
  queryDefecationHistory,
  queryJournal,
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
import {
  auditNumbers,
  bounded,
  consumedAt,
  dateRange,
  runTool,
  timezoneArg,
  withRange,
} from "@/lib/mcp/tool-runtime";
import type { McpReadToolName, McpWriteToolName } from "@/lib/mcp/tool-catalog";
import { VOICE_ITEM_SPEC } from "@intake/core/voice-items";
import { SODIUM_FRACTIONS } from "@intake/core/sodium";
import {
  JOURNAL_FINDING_MAX,
  JOURNAL_KINDS,
  JOURNAL_TIME_PRECISIONS,
  JOURNAL_WORDS_MAX,
  PLACE_OPTIONS,
} from "@intake/core/journal";
import type { JournalEntryKind, JournalTimePrecision } from "@intake/types/records";
import {
  type RecordKind,
  addJournalEntry,
  deleteLoggedRecord,
  logBloodPressure,
  logEstimate,
  logSodium,
  logWeight,
} from "@/lib/mcp/record-writes";
import { deleteMedicationRecord } from "@/lib/mcp/medication-writes";
import { registerMedicationWriteTools } from "@/lib/mcp/medication-tools";

const DELETABLE_KINDS = [
  "sodium",
  "weight",
  "blood_pressure",
  "urination",
  "defecation",
  "journal_entry",
  "extra_medicine",
  "stock_refill",
] as const satisfies readonly (RecordKind | "extra_medicine" | "stock_refill")[];

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

  server.registerTool(
    tool("query_defecation_history"),
    {
      title: "Bowel movement history",
      description:
        "Bowel movements in the given time range, each with an amount estimate ('small' | 'medium' | 'large', or null) and an optional note. Returned oldest first. Capped at 5000 rows: when `truncated` is true the NEWEST 5000 rows in the range are kept, so page further back by calling again with end_ms set just before the first row's timestamp.",
      inputSchema: dateRange,
    },
    async (args, ctx) =>
      runTool(ctx, "query_defecation_history", args, args, (userId) =>
        queryDefecationHistory(userId, { start: args.start_ms, end: args.end_ms }),
      ),
  );

  server.registerTool(
    tool("query_journal"),
    {
      title: "Medical journal",
      description:
        "The user's medical journal entries in the given time range: things they felt (`kind`='symptom'), saw ('sign') or that happened ('event'). `words` is exactly what they said or typed; `finding` is the short title a doctor reads first. `places` are body-place ids (sided ones end in -l / -r, the user's own left or right) with readable `placeLabels`; `severity` is a 0-10 rating or null when not rated; `timePrecision` says whether `timestamp` is 'exact', 'approx' or only the 'day'. Treat the words as the user's private notes: quote them only to the user. Returned oldest first. Capped at 5000 rows: when `truncated` is true the NEWEST 5000 rows in the range are kept, so page further back by calling again with end_ms set just before the first row's timestamp.",
      inputSchema: dateRange,
    },
    async (args, ctx) =>
      runTool(ctx, "query_journal", args, args, (userId) =>
        queryJournal(userId, { start: args.start_ms, end: args.end_ms }),
      ),
  );

  server.registerTool(
    tool("get_profile"),
    {
      title: "Profile and settings",
      description:
        "The user's medical conditions as they entered them in the app (e.g. 'HFrEF'), and the settings that give the numbers their meaning: daily limits (water_ml, sodium_mg, sugar_g, potassium_mg), which optional trackers are on, the day-start hour (a day's totals run from this hour), the first day of the week (0 = Sunday, 1 = Monday), the home time zone and region. `settings` is null when the app has not synced settings yet.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) =>
      runTool(ctx, "get_profile", {}, null, (userId) => getProfile(userId)),
  );

  server.registerTool(
    tool("list_insight_reports"),
    {
      title: "Saved AI analyses",
      description:
        "AI analyses the user generated in the app's Metrics window, newest first: the period analysed (`rangeStart`..`rangeEnd`, unix ms), `mode` ('fast' summary or 'deep' research with web `sources`), whether the user's medical profile was used (`personalised`), the `narrative` and the `observations`. They are AI output, not clinical advice.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(10).describe("Number of reports (1-50, default 10)"),
      }),
    },
    async (args, ctx) =>
      runTool(ctx, "list_insight_reports", args, args, (userId) =>
        listInsightReports(userId, args.limit),
      ),
  );
}

// ─── Log tools ────────────────────────────────────────────────────────

const FOOD = VOICE_ITEM_SPEC.food;
const DRINK = VOICE_ITEM_SPEC.alcohol;

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

  const noteArg = z
    .string()
    .trim()
    .max(VOICE_ITEM_SPEC.weight.note.maxLength)
    .optional()
    .describe(`A short note, in the user's words (max ${VOICE_ITEM_SPEC.weight.note.maxLength} characters)`);
  const takenAt = consumedAt.describe("When it happened, unix milliseconds. Defaults to now.");
  const writeAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
  const undoHint =
    "Returns `id` and `kind`; pass both to delete_logged_record to undo a mistake. The entry appears in the app the next time the app syncs.";
  /** Numbers and choices only: notes and words never reach the audit log. */
  const auditFields = (args: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(args).filter(
        ([k, v]) => typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && !["note", "words", "finding"].includes(k)),
      ),
    );

  server.registerTool(
    tool("log_sodium"),
    {
      title: "Log salt or sodium",
      annotations: writeAnnotations,
      description: `Log salt, MSG or sodium the user added on its own (a pinch of salt on dinner, a stock cube), not part of a meal: for a meal use log_food with its sodium_mg. Give what the user added as they said it: \`amount\` with \`unit\` ('mg' or 'g') and \`source\` ('salt', 'msg' or 'sodium'); the app converts it to sodium (1 g salt is about 393 mg sodium, 1 g MSG about 123 mg). Before logging, tell the user the values you will log. ${undoHint}`,
      inputSchema: z.object({
        amount: z.number().positive().max(100000).describe("Amount added, in `unit`"),
        unit: z.enum(["mg", "g"]),
        source: z.enum(["salt", "msg", "sodium"]).describe("What was added: table salt, MSG, or sodium itself"),
        note: noteArg,
        at_ms: takenAt,
        timezone: timezoneArg,
      }).refine((a) => {
        const mg = (a.unit === "g" ? a.amount * 1000 : a.amount) * SODIUM_FRACTIONS[a.source];
        return mg >= VOICE_ITEM_SPEC.salt.sodiumMg.min && mg <= VOICE_ITEM_SPEC.salt.sodiumMg.max;
      }, { message: `That is outside ${VOICE_ITEM_SPEC.salt.sodiumMg.min}-${VOICE_ITEM_SPEC.salt.sodiumMg.max} mg of sodium`, path: ["amount"] }),
    },
    async (args, ctx) =>
      runTool(ctx, "log_sodium", args, auditFields(args), (userId) =>
        logSodium(userId, { amount: args.amount, unit: args.unit, source: args.source, note: args.note, timestamp: args.at_ms ?? Date.now(), timezone: args.timezone }),
        { write: true },
      ),
  );

  const W = VOICE_ITEM_SPEC.weight;
  server.registerTool(
    tool("log_weight"),
    {
      title: "Log weight",
      annotations: writeAnnotations,
      description: `Log a weight reading in kg (convert from lb or stone first and say so). Before logging, tell the user the value you will log. ${undoHint}`,
      inputSchema: z.object({
        weight_kg: bounded(W.weightKg, "Weight"),
        note: noteArg,
        at_ms: takenAt,
        timezone: timezoneArg,
      }),
    },
    async (args, ctx) =>
      runTool(ctx, "log_weight", args, auditFields(args), (userId) =>
        logWeight(userId, { weightKg: args.weight_kg, note: args.note, timestamp: args.at_ms ?? Date.now(), timezone: args.timezone }),
        { write: true },
      ),
  );

  const BP = VOICE_ITEM_SPEC.blood_pressure;
  const wholeBounded = (spec: { min: number; max: number; unit: string }, d: string) =>
    z.number().int().min(spec.min).max(spec.max).describe(`${d} (${spec.unit})`);
  server.registerTool(
    tool("log_blood_pressure"),
    {
      title: "Log blood pressure",
      annotations: writeAnnotations,
      description: `Log one blood pressure reading: systolic over diastolic in mmHg, with the heart rate when the user has it. Position defaults to sitting and arm to left, as in the app; ask when it matters. Log each reading separately. Before logging, tell the user the values you will log. ${undoHint}`,
      inputSchema: z
        .object({
          systolic: wholeBounded(BP.systolic, "Systolic, the top number"),
          diastolic: wholeBounded(BP.diastolic, "Diastolic, the bottom number"),
          heart_rate: wholeBounded(BP.heartRate, "Heart rate").optional(),
          irregular_heartbeat: z.boolean().optional().describe("The monitor flagged an irregular heartbeat"),
          position: z.enum(["sitting", "standing"]).optional(),
          arm: z.enum(["left", "right"]).optional(),
          note: noteArg,
          at_ms: takenAt,
          timezone: timezoneArg,
        })
        .refine((a) => a.systolic > a.diastolic, { message: "systolic must be higher than diastolic", path: ["diastolic"] }),
    },
    async (args, ctx) =>
      runTool(ctx, "log_blood_pressure", args, auditFields(args), (userId) =>
        logBloodPressure(userId, {
          systolic: args.systolic,
          diastolic: args.diastolic,
          heartRate: args.heart_rate,
          irregularHeartbeat: args.irregular_heartbeat,
          position: args.position,
          arm: args.arm,
          note: args.note,
          timestamp: args.at_ms ?? Date.now(),
          timezone: args.timezone,
        }),
        { write: true },
      ),
  );

  const amountEstimate = z
    .enum(["small", "medium", "large"])
    .describe("Rough amount: small, medium or large");
  for (const kind of ["urination", "defecation"] as const) {
    const name = kind === "urination" ? "log_urination" : "log_defecation";
    server.registerTool(
      tool(name),
      {
        title: kind === "urination" ? "Log urination" : "Log bowel movement",
        annotations: writeAnnotations,
        description:
          kind === "urination"
            ? `Log one urination with a rough amount. The app always records an amount, so ask the user when they did not say. ${undoHint}`
            : `Log one bowel movement, with a rough amount when the user gives one. Put anything notable (colour, consistency) in the note in the user's words. ${undoHint}`,
        inputSchema: z.object({
          amount_estimate: kind === "urination" ? amountEstimate : amountEstimate.optional(),
          note: noteArg,
          at_ms: takenAt,
          timezone: timezoneArg,
        }),
      },
      async (args, ctx) =>
        runTool(ctx, name, args, auditFields(args), (userId) =>
          logEstimate(userId, kind, { amountEstimate: args.amount_estimate, note: args.note, timestamp: args.at_ms ?? Date.now(), timezone: args.timezone }),
          { write: true },
        ),
    );
  }

  server.registerTool(
    tool("add_journal_entry"),
    {
      title: "Add a journal entry",
      annotations: writeAnnotations,
      description: `Add one entry to the user's medical journal: something they felt (kind 'symptom', e.g. knee pain), saw ('sign', e.g. a rash, swollen ankles) or that happened ('event', e.g. a fall, a missed night's sleep). \`words\` is what the user said, in their words; \`finding\` a short title a doctor reads first ('Knee pain'; defaults to the start of the words). \`places\` are body-place ids from this list (sided ones need the user's own side, -l or -r; ask when they did not say): ${PLACE_OPTIONS.map((p) => p.id).join(", ")}. \`severity\` is a 0-10 rating only when the user gave one. One thing per entry: if it comes back later, that is a new entry. Before adding, tell the user what you will add. The result's \`notices\` are safety messages the app shows for this entry (for example call 112 for chest pain): always pass them on to the user word for word. ${undoHint}`,
      inputSchema: z.object({
        words: z.string().trim().min(1).max(JOURNAL_WORDS_MAX).describe(`What the user noticed, in their words (max ${JOURNAL_WORDS_MAX} characters)`),
        finding: z.string().trim().max(JOURNAL_FINDING_MAX).optional().describe(`Short title (max ${JOURNAL_FINDING_MAX} characters)`),
        kind: z.enum(JOURNAL_KINDS as [JournalEntryKind, ...JournalEntryKind[]]),
        places: z.array(z.string()).max(PLACE_OPTIONS.length).optional().describe("Body-place ids"),
        severity: z.number().int().min(0).max(10).optional().describe("0-10 rating, only when the user gave one"),
        time_precision: z
          .enum(JOURNAL_TIME_PRECISIONS as [JournalTimePrecision, ...JournalTimePrecision[]])
          .optional()
          .describe("'exact' (default), 'approx' (about then) or 'day' (only the day is known)"),
        at_ms: takenAt,
        timezone: timezoneArg,
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "add_journal_entry",
        args,
        { kind: args.kind, severity: args.severity ?? null, places: args.places?.length ?? 0, at_ms: args.at_ms ?? null },
        (userId) =>
          addJournalEntry(userId, {
            words: args.words,
            finding: args.finding,
            kind: args.kind,
            places: args.places,
            severity: args.severity,
            timePrecision: args.time_precision,
            timestamp: args.at_ms ?? Date.now(),
            timezone: args.timezone,
          }),
        { write: true },
      ),
  );

  server.registerTool(
    tool("delete_logged_record"),
    {
      title: "Delete a logged record",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      description:
        "Remove one record this connector logged, by the `kind` and `id` its log tool returned. Use it to undo a wrong or duplicate entry, and only when the user asks. A deleted journal entry keeps no words. Records the user logged in the app can't be removed here; the user removes those in the app. For a meal or drink use delete_logged_entry; to undo a taken or skipped dose use log_dose with action 'not_taken'.",
      inputSchema: z.object({
        kind: z.enum(DELETABLE_KINDS),
        id: z.string().uuid().describe("The id the log tool returned"),
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "delete_logged_record",
        args,
        { kind: args.kind, id: args.id },
        async (userId) => {
          const result =
            args.kind === "extra_medicine" || args.kind === "stock_refill"
              ? await deleteMedicationRecord(userId, args.kind, args.id)
              : await deleteLoggedRecord(userId, args.kind, args.id);
          if (result.deleted) return result;
          return {
            ...result,
            message:
              result.reason === "not_found"
                ? "No live record of this kind has this id. It may already be deleted."
                : "This record was logged in the app, not by Claude. The user can remove it in the app.",
          };
        },
        { write: true },
      ),
  );

  registerMedicationWriteTools(server);
}
