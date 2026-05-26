/**
 * MCP tool registry — read-only.
 *
 * Each tool:
 *   - validates its input with Zod (date-range sanity, etc.)
 *   - extracts userId from request.auth (set by withMcpAuth → verifyToken)
 *   - calls a query function in ./queries
 *   - writes an audit log row (fire-and-forget)
 *   - returns a `content: [{ type: "text", text: JSON }]` MCP response
 *
 * No write/delete/update tools are registered — claude.ai cannot mutate
 * state through this connector even if the model tries.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  getInventoryStatus,
  getTodaySummary,
  listMedications,
  listRecentDoses,
  queryBloodPressureHistory,
  queryEatingHistory,
  queryIntakeHistory,
  queryWeightHistory,
} from "@/lib/mcp/queries";
import { writeMcpAudit } from "@/lib/mcp/audit";

const ONE_YEAR_MS = 365 * 24 * 60 * 60_000;

const dateRangeShape = {
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

function validateRange(args: { start_ms: number; end_ms: number }) {
  if (args.end_ms < args.start_ms) {
    throw new Error("end_ms must be >= start_ms");
  }
  if (args.end_ms - args.start_ms > ONE_YEAR_MS) {
    throw new Error("Range must be <= 1 year");
  }
}

interface AuthCtx {
  authInfo?: AuthInfo;
}

function getAuth(ctx: AuthCtx): { userId: string; clientId: string } {
  const info = ctx.authInfo;
  if (!info?.extra || typeof info.extra !== "object") {
    throw new Error("Missing auth context");
  }
  const extra = info.extra as { userId?: string; clientId?: string };
  if (!extra.userId || !extra.clientId) {
    throw new Error("Missing userId/clientId in auth context");
  }
  return { userId: extra.userId, clientId: extra.clientId };
}

async function runTool<TArgs extends Record<string, unknown>>(
  ctx: AuthCtx,
  tool: string,
  args: TArgs,
  argsForAudit: Record<string, unknown> | null,
  body: (userId: string) => Promise<unknown>,
) {
  const started = Date.now();
  const { userId, clientId } = getAuth(ctx);
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
  server.registerTool(
    "get_today_summary",
    {
      title: "Today's summary",
      description:
        "Totals for water/salt/sugar/potassium intake since the user's day-start hour, plus the latest blood-pressure and weight readings, and doses logged today.",
      inputSchema: {},
    },
    async (_args, ctx) =>
      runTool(ctx, "get_today_summary", {}, null, (userId) =>
        getTodaySummary(userId),
      ),
  );

  server.registerTool(
    "query_intake_history",
    {
      title: "Intake history",
      description:
        "Returns individual water/salt/sugar/potassium intake records in the given time range. Use type='all' to combine.",
      inputSchema: {
        type: z
          .enum(["water", "salt", "sugar", "potassium", "all"])
          .describe("Intake type to filter on, or 'all'"),
        ...dateRangeShape,
      },
    },
    async (args, ctx) =>
      runTool(
        ctx,
        "query_intake_history",
        args,
        { type: args.type, start_ms: args.start_ms, end_ms: args.end_ms },
        (userId) => {
          validateRange(args);
          return queryIntakeHistory(userId, args.type, {
            start: args.start_ms,
            end: args.end_ms,
          });
        },
      ),
  );

  server.registerTool(
    "query_weight_history",
    {
      title: "Weight history",
      description:
        "Weight readings (kg) in the given time range, oldest first. Capped at 5000 rows.",
      inputSchema: dateRangeShape,
    },
    async (args, ctx) =>
      runTool(ctx, "query_weight_history", args, args, (userId) => {
        validateRange(args);
        return queryWeightHistory(userId, {
          start: args.start_ms,
          end: args.end_ms,
        });
      }),
  );

  server.registerTool(
    "query_blood_pressure_history",
    {
      title: "Blood pressure history",
      description:
        "Systolic/diastolic/heart-rate readings in the given time range, oldest first. Capped at 5000 rows.",
      inputSchema: dateRangeShape,
    },
    async (args, ctx) =>
      runTool(ctx, "query_blood_pressure_history", args, args, (userId) => {
        validateRange(args);
        return queryBloodPressureHistory(userId, {
          start: args.start_ms,
          end: args.end_ms,
        });
      }),
  );

  server.registerTool(
    "query_eating_history",
    {
      title: "Eating history",
      description:
        "Food log entries in the given time range, with linked caffeine/alcohol substances. Capped at 5000 rows.",
      inputSchema: dateRangeShape,
    },
    async (args, ctx) =>
      runTool(ctx, "query_eating_history", args, args, (userId) => {
        validateRange(args);
        return queryEatingHistory(userId, {
          start: args.start_ms,
          end: args.end_ms,
        });
      }),
  );

  server.registerTool(
    "list_medications",
    {
      title: "List active medications",
      description:
        "All active prescriptions with their currently-active phase and enabled schedules.",
      inputSchema: {},
    },
    async (_args, ctx) =>
      runTool(ctx, "list_medications", {}, null, (userId) =>
        listMedications(userId),
      ),
  );

  server.registerTool(
    "list_recent_doses",
    {
      title: "Recent doses",
      description:
        "The most recent dose log entries (taken / skipped / rescheduled / pending) joined with prescription names.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe("Number of rows to return (1-500, default 50)"),
      },
    },
    async (args, ctx) =>
      runTool(ctx, "list_recent_doses", args, args, (userId) =>
        listRecentDoses(userId, args.limit),
      ),
  );

  server.registerTool(
    "get_inventory_status",
    {
      title: "Inventory status",
      description:
        "Per-prescription pill stock and refill thresholds for active inventory items.",
      inputSchema: {},
    },
    async (_args, ctx) =>
      runTool(ctx, "get_inventory_status", {}, null, (userId) =>
        getInventoryStatus(userId),
      ),
  );
}
