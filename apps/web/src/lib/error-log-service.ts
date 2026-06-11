/**
 * Error log capture for the Debug panel.
 *
 * Persists captured errors/warnings to the `_errorLogs` Dexie table so they can
 * be inspected on devices where no devtools are available (Capacitor, mobile
 * Safari). Sources:
 *   - window.onerror             → "window-error"
 *   - unhandledrejection         → "unhandled-rejection"
 *   - ErrorBoundary.componentDidCatch → "error-boundary"
 *   - console.error / console.warn   → "console-error" / "console-warn"
 *
 * Storage is local-only — entries are never synced or backed up. A capped LRU
 * trim keeps the table at MAX_ENTRIES.
 */

import { db, type ErrorLogEntry, type ErrorLogSource } from "@/lib/db";

const MAX_ENTRIES = 500;
const CLIENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
const MESSAGE_MAX = 2000;
const STACK_MAX = 8000;

// Capture the originals before anyone patches them. Even after install we
// always route through these so the service never recurses through its own
// patched console.
const originalConsoleError =
  typeof console !== "undefined" ? console.error.bind(console) : () => {};
const originalConsoleWarn =
  typeof console !== "undefined" ? console.warn.bind(console) : () => {};

let installed = false;
let writingDepth = 0;

function truncate(s: string | undefined, n: number): string | undefined {
  if (s == null) return undefined;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function safeFormat(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function currentRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // Pathname only — query strings can contain tokens or other sensitive
  // params that should not be persisted into exported debug logs.
  return window.location.pathname;
}

export async function logError(
  source: ErrorLogSource,
  fields: {
    message: string;
    stack?: string | undefined;
    componentStack?: string | undefined;
  },
): Promise<void> {
  if (typeof window === "undefined") return;
  // Guard against the persistence layer itself throwing into console.error
  // and re-entering the capture path.
  if (writingDepth > 0) return;
  writingDepth++;
  try {
    const route = currentRoute();
    const stack = fields.stack ? truncate(fields.stack, STACK_MAX) : undefined;
    const componentStack = fields.componentStack
      ? truncate(fields.componentStack, STACK_MAX)
      : undefined;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
    const entry: ErrorLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      source,
      message: truncate(fields.message, MESSAGE_MAX) ?? "(no message)",
      ...(stack !== undefined ? { stack } : {}),
      ...(componentStack !== undefined ? { componentStack } : {}),
      ...(route !== undefined ? { route } : {}),
      ...(ua !== undefined ? { userAgent: ua } : {}),
      appVersion: CLIENT_VERSION,
    };
    await db._errorLogs.put(entry);

    // Best-effort LRU trim: only enforce when count exceeds the cap.
    const count = await db._errorLogs.count();
    if (count > MAX_ENTRIES) {
      const overflow = count - MAX_ENTRIES;
      const oldest = await db._errorLogs
        .orderBy("timestamp")
        .limit(overflow)
        .primaryKeys();
      if (oldest.length > 0) await db._errorLogs.bulkDelete(oldest);
    }
  } catch (e) {
    // Last-ditch: never throw out of the error pipeline.
    originalConsoleError("[error-log-service] write failed:", e);
  } finally {
    writingDepth--;
  }
}

export async function getErrorLogs(limit = 200): Promise<ErrorLogEntry[]> {
  return db._errorLogs.orderBy("timestamp").reverse().limit(limit).toArray();
}

export async function clearErrorLogs(): Promise<void> {
  await db._errorLogs.clear();
}

export async function exportErrorLogs(): Promise<string> {
  const logs = await db._errorLogs
    .orderBy("timestamp")
    .reverse()
    .toArray();
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), appVersion: CLIENT_VERSION, logs },
    null,
    2,
  );
}

/**
 * Install global handlers + patch console.error/console.warn.
 * Idempotent — safe to call multiple times. No-op on the server.
 */
export function installErrorCapture(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error;
    const stack = err instanceof Error ? err.stack : undefined;
    void logError("window-error", {
      message: event.message || (err instanceof Error ? err.message : String(err)),
      ...(stack !== undefined ? { stack } : {}),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : safeFormat([reason]);
    const stack = reason instanceof Error ? reason.stack : undefined;
    void logError("unhandled-rejection", {
      message,
      ...(stack !== undefined ? { stack } : {}),
    });
  });

  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    void logError("console-error", { message: safeFormat(args) });
  };
  console.warn = (...args: unknown[]) => {
    originalConsoleWarn(...args);
    void logError("console-warn", { message: safeFormat(args) });
  };
}

/** Bypass the console patch — use when an internal caller wants to log without
 *  re-entering the capture pipeline (e.g. ErrorBoundary calling console.error
 *  for devtools visibility while it also writes its own entry). */
export function rawConsoleError(...args: unknown[]): void {
  originalConsoleError(...args);
}
