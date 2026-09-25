/**
 * Shared DatabaseClosedError recovery for local writes.
 *
 * The browser can sever the IndexedDB connection out from under the app
 * (issue #287). `recoverClosedDatabase` in `db.ts` reopens it; this module
 * wraps a write so every write hook gets the same "reopen once and retry"
 * behaviour the voice panel already had, instead of failing until reload.
 *
 * Save failures are also buffered in memory. The persistent error log
 * (`_errorLogs`) lives in the same IndexedDB, so while the connection is
 * severed a `console.error` cannot be persisted. Buffered entries are
 * re-logged once a recovery succeeds, so the cause still reaches bug reports.
 */

import { recoverClosedDatabase } from "@/lib/db";

export interface BufferedSaveError {
  timestamp: number;
  context: string;
  message: string;
}

const MAX_BUFFERED = 20;
const buffer: BufferedSaveError[] = [];

function describe(e: unknown): string {
  if (e instanceof Error) {
    const cause = e.cause instanceof Error ? ` (cause: ${e.cause.name}: ${e.cause.message})` : "";
    return `${e.name}: ${e.message}${cause}`;
  }
  return String(e);
}

/**
 * Record a failed save: log it (devtools + the error-log pipeline, when the
 * database is reachable) and keep an in-memory copy in case it is not.
 */
export function reportSaveError(context: string, e: unknown): void {
  buffer.push({ timestamp: Date.now(), context, message: describe(e) });
  if (buffer.length > MAX_BUFFERED) buffer.shift();
  console.error(`[save] ${context} failed:`, e);
}

/** Save failures seen this session that may not have reached the error log. */
export function getBufferedSaveErrors(): readonly BufferedSaveError[] {
  return buffer.slice();
}

/** Test-only reset. */
export function clearBufferedSaveErrors(): void {
  buffer.length = 0;
}

function flushBufferedSaveErrors(): void {
  if (buffer.length === 0) return;
  const pending = buffer.splice(0, buffer.length);
  for (const entry of pending) {
    console.error(
      `[save] earlier failure (${new Date(entry.timestamp).toISOString()}) ${entry.context}: ${entry.message}`,
    );
  }
}

/**
 * Run a local database write; if it fails with DatabaseClosedError, reopen
 * the database and retry exactly once. Any other error, or a failed reopen,
 * is rethrown unchanged. A write rejected with DatabaseClosedError never
 * reached IndexedDB, so the single retry cannot duplicate it.
 */
export async function withDbRecovery<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (!(await recoverClosedDatabase(e))) throw e;
    // The connection is back, so the error log can persist again.
    console.warn("[db] reopened after DatabaseClosedError; retrying write");
    flushBufferedSaveErrors();
    return await write();
  }
}
