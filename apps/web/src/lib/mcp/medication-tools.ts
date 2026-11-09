/**
 * MCP medication write tools: log_dose, log_extra_medicine, refill_stock.
 *
 * They let Claude do for medicines what the app's voice log does: mark a
 * scheduled dose taken, skipped or not taken, log a medicine taken outside
 * the schedule, add pills to stock. Like voice, they never add a
 * prescription, a schedule or a stock item; those are set up in the app.
 * The writes are in ./medication-writes; each needs the write scope.
 *
 * Audit args carry ids, dates and numbers only: never a name, note or
 * skip reason.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { logDose, logExtraMedicine, refillStock } from "@/lib/mcp/medication-writes";
import { ONE_YEAR_MS, bounded, runTool, timezoneArg } from "@/lib/mcp/tool-runtime";
import type { McpWriteToolName } from "@/lib/mcp/tool-catalog";
import { VOICE_ITEM_SPEC } from "@intake/core/voice-items";
import { isFutureTimestamp } from "@intake/core/record-schemas";

const EXTRA = VOICE_ITEM_SPEC.extra_medicine;
const REFILL = VOICE_ITEM_SPEC.stock_refill;
const DOSE = VOICE_ITEM_SPEC.scheduled_dose;

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const SYNC_NOTE = "The change appears in the app the next time the app syncs.";

const id = (what: string) => z.string().min(1).max(100).describe(what);

const takenAtArg = z
  .number()
  .int()
  .refine((ts) => !isFutureTimestamp(ts, Date.now()), {
    message: "taken_at_ms can't be in the future",
  })
  .refine((ts) => ts >= Date.now() - ONE_YEAR_MS, {
    message: "taken_at_ms must be within the last year",
  })
  .optional()
  .describe("When the user took it, unix milliseconds. Defaults to now.");

/** Ids, dates and numbers of the args: never free text. */
function auditOf(args: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]),
  );
}

export function registerMedicationWriteTools(server: McpServer): void {
  const tool = (name: McpWriteToolName) => name;

  server.registerTool(
    tool("log_dose"),
    {
      title: "Log a scheduled dose",
      annotations: WRITE_ANNOTATIONS,
      description:
        "Mark one scheduled medicine dose as taken or skipped, or undo a take or skip Claude made with `not_taken` (a taken dose gets its pills back in stock; a skipped dose is open again). A dose the user marked in the app can't be undone here; the user undoes it in the app. Take the `scheduleId` from get_today_summary (`doses.slots`) or list_medications (`phase.schedules[].id`), and `date` is the local date of that dose (YYYY-MM-DD, `doses.scheduled_date` for today). Taking a dose takes its pills out of the medicine's active stock. A dose of a future day can't be taken or skipped. Marking an already-taken dose taken changes nothing (`changed: false`). For a medicine taken outside its schedule, use log_extra_medicine instead. Before writing, tell the user which dose you will mark and how, and wait for their yes. A refusal comes back as `ok: false` with a `message`; tell the user. " +
        SYNC_NOTE,
      inputSchema: z.object({
        schedule_id: id("The dose's scheduleId, from get_today_summary or list_medications"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be YYYY-MM-DD" })
          .describe("Local date of the dose, YYYY-MM-DD"),
        action: z.enum(DOSE.action.values).describe("taken, skipped, or not_taken (undo a take or a skip)"),
        taken_at_ms: takenAtArg,
        skip_reason: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe("Why the dose was skipped, in the user's words (only with action 'skipped')"),
        timezone: timezoneArg,
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "log_dose",
        args,
        auditOf(args, ["schedule_id", "date", "action", "taken_at_ms"]),
        (userId) =>
          logDose(userId, {
            scheduleId: args.schedule_id,
            date: args.date,
            action: args.action,
            takenAt: args.action === "taken" ? args.taken_at_ms : undefined,
            skipReason: args.action === "skipped" ? args.skip_reason : undefined,
            timezone: args.timezone,
          }),
        { write: true },
      ),
  );

  server.registerTool(
    tool("log_extra_medicine"),
    {
      title: "Log an extra medicine",
      annotations: WRITE_ANNOTATIONS,
      description:
        "Log a medicine the user took outside their schedule. For a medicine on the user's list, pass its `prescription_id` from list_medications: it is saved as an extra (as-needed) dose, and its pills come out of stock when the amount is in mg, tablets or capsules. For a medicine that is not on the list (a paracetamol), pass `medicine_name` only: it is saved by name, with no stock change and no new prescription. A `medicine_name` that is exactly a medicine on the list is logged as that medicine. For a dose of the schedule, use log_dose instead. Before writing, tell the user what you will log and wait for their yes; call this once per dose. Returns `dose_log_id`; pass it to delete_logged_record to undo a mistake. " +
        SYNC_NOTE,
      inputSchema: z
        .object({
          prescription_id: id("The medicine's prescription id, from list_medications").optional(),
          medicine_name: z
            .string()
            .trim()
            .min(1)
            .max(EXTRA.medicine.maxLength)
            .optional()
            .describe("The medicine's name, for one not on the user's list"),
          amount: bounded(EXTRA.amount, "How much was taken, in `unit`").optional(),
          unit: z.enum(EXTRA.unit.values).optional().describe("The unit of `amount`"),
          taken_at_ms: takenAtArg,
          note: z.string().trim().max(EXTRA.note.maxLength).optional().describe("A short note, in the user's words"),
          timezone: timezoneArg,
        })
        .refine((a) => a.prescription_id !== undefined || a.medicine_name !== undefined, {
          message: "Give prescription_id (a medicine on the list) or medicine_name (one that is not)",
          path: ["prescription_id"],
        })
        .refine((a) => a.unit === undefined || a.amount !== undefined, {
          message: "unit needs an amount",
          path: ["unit"],
        }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "log_extra_medicine",
        args,
        auditOf(args, ["prescription_id", "amount", "unit", "taken_at_ms"]),
        (userId) =>
          logExtraMedicine(userId, {
            prescriptionId: args.prescription_id,
            medicineName: args.medicine_name,
            amount: args.amount,
            unit: args.unit,
            takenAt: args.taken_at_ms,
            note: args.note,
            timezone: args.timezone,
          }),
        { write: true },
      ),
  );

  server.registerTool(
    tool("refill_stock"),
    {
      title: "Refill medicine stock",
      annotations: WRITE_ANNOTATIONS,
      description:
        "Add pills to the stock of a medicine on the user's list (a new box or prescription refill). Pass the `prescription_id` from list_medications; the pills go to its active stock item (see get_inventory_status). A medicine with no stock item is refused: the user sets one up in the app. Before writing, tell the user how many pills you will add to which medicine and wait for their yes. Returns `transaction_id` and the new stock; pass the transaction_id to delete_logged_record to undo a mistake. " +
        SYNC_NOTE,
      inputSchema: z.object({
        prescription_id: id("The medicine's prescription id, from list_medications"),
        pills: bounded(REFILL.pills, "Pills added"),
      }),
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "refill_stock",
        args,
        auditOf(args, ["prescription_id", "pills"]),
        (userId) => refillStock(userId, { prescriptionId: args.prescription_id, pills: args.pills }),
        { write: true },
      ),
  );
}
