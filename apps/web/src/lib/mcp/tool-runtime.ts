/**
 * Shared plumbing for the MCP tool modules: auth context, the scope check,
 * the audit row and the reply shape (`runTool`), and the argument shapes
 * several tools share (time ranges, time zone, bounded numbers, a past
 * timestamp).
 */
import { z } from "zod";
import type { ServerContext } from "@modelcontextprotocol/server";
import { writeMcpAudit } from "@/lib/mcp/audit";
import { isValidTimeZone } from "@/lib/mcp/day-window";
import { READ_SCOPE, WRITE_SCOPE } from "@/lib/mcp/scopes";
import { isFutureTimestamp } from "@intake/core/record-schemas";

export const ONE_YEAR_MS = 365 * 24 * 60 * 60_000;

export const rangeShape = {
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

export function withRange<S extends z.ZodRawShape>(shape: S) {
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

export const dateRange = withRange({});

export const timezoneArg = z
  .string()
  .refine(isValidTimeZone, {
    message: "timezone must be an IANA time zone such as 'Europe/Berlin'",
  })
  .optional()
  .describe(
    "The user's IANA time zone (e.g. 'Europe/Berlin'). Defaults to the zone the app last reported for the user, else UTC.",
  );

export function getAuth(ctx: ServerContext): {
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

export async function runTool<TArgs extends Record<string, unknown>>(
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

export function bounded(
  spec: { min: number; max: number; unit: string },
  description: string,
) {
  return z.number().min(spec.min).max(spec.max).describe(`${description} (${spec.unit})`);
}

export const consumedAt = z
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
export function auditNumbers(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).filter(([, v]) => typeof v === "number"),
  );
}
