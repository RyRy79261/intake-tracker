/**
 * The sync protocol: last-write-wins conflict rules, as pure functions.
 *
 * The server's push route and the client's pull both decide "which copy of a
 * row wins". They used to carry their own copies of the rules (the route
 * twice: full rows and tombstone stubs; the engine once), so a change to one
 * could leave the other behind. Here they are written once, and the route and
 * the engine are adapters: they load rows, ask these functions, and write.
 * No I/O, no clock reads (the caller passes `serverNow`).
 *
 * The rules (D-12, in precedence order), for an incoming push against the
 * server's row:
 *   1. A server tombstone is not brought back by a live write that is not
 *      strictly newer than it. A strictly newer live write is an explicit
 *      restore (undo after the delete already synced, audit sync-engine#8).
 *   2. No server row, or the incoming row is strictly newer → write it.
 *   2b. An incoming tombstone that ties a live server row exactly → write it:
 *      deleting is a deliberate act and beats a concurrent edit on a tie.
 *   3. Otherwise the server keeps its row (a tie between two live writes goes
 *      to the server, so the result does not depend on arrival order).
 * `userSettings` rows that are both live merge per setting instead
 * (lib/settings-merge.ts). A client clock more than a minute ahead is clamped
 * to `serverNow + 1 min`, so a wrong clock cannot win every future conflict.
 *
 * The pull applies the same rules from the device's side: a pulled server row
 * replaces the local one only when it would win the push above.
 */
import { mergeSettingsRows, type SettingsRowLike } from "@/lib/settings-merge";

/** How far ahead of the server a client `updatedAt` may be. */
export const MAX_FUTURE_MS = 60_000;

/** A synced row as the protocol sees it. */
export type SyncRow = Record<string, unknown> & {
  id: string;
  updatedAt?: number;
  deletedAt?: number | null;
};

const isTombstone = (row: { deletedAt?: number | null }) => row.deletedAt != null;

/** The incoming `updatedAt`, clamped so a client clock ahead cannot win forever. */
export function clampUpdatedAt(updatedAt: number, serverNow: number): number {
  return Math.min(updatedAt, serverNow + MAX_FUTURE_MS);
}

/** A pushed settings row with its updatedAt and setting stamps clamped. */
function clampSettingsRow(
  row: SyncRow,
  updatedAt: number,
  maxStamp: number,
): SettingsRowLike {
  const raw = row.fieldUpdatedAt;
  let stamps: Record<string, number> | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    stamps = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        stamps[key] = Math.min(value, maxStamp);
      }
    }
  }
  return { ...row, updatedAt, fieldUpdatedAt: stamps } as unknown as SettingsRowLike;
}

/** What the server does with one pushed row. */
export type PushDecision =
  /** Keep the server row; ack with the `updatedAt` the server holds. */
  | { kind: "keep"; ackUpdatedAt: number }
  /**
   * Write `row` with `updatedAt` (insert, or overwrite the server row). With a
   * `guardUpdatedAt`, the overwrite must only apply while the server row still
   * has that `updatedAt` (a merged settings row); otherwise retry later.
   */
  | {
      kind: "write";
      row: Record<string, unknown>;
      updatedAt: number;
      guardUpdatedAt: number | null;
    };

/** Decide a pushed full row against the server's copy (`undefined` if none). */
export function resolvePush(input: {
  tableName: string;
  incoming: SyncRow & { updatedAt: number };
  server: (SyncRow & { updatedAt: number }) | undefined;
  serverNow: number;
}): PushDecision {
  const { tableName, incoming, server, serverNow } = input;
  const clamped = clampUpdatedAt(incoming.updatedAt, serverNow);

  if (!server) return { kind: "write", row: incoming, updatedAt: clamped, guardUpdatedAt: null };

  // Rule 1: a stale live write never resurrects a server tombstone.
  if (isTombstone(server) && !isTombstone(incoming) && clamped <= server.updatedAt) {
    return { kind: "keep", ackUpdatedAt: server.updatedAt };
  }

  // userSettings: two live rows merge per setting.
  if (tableName === "userSettings" && !isTombstone(server) && !isTombstone(incoming)) {
    const merge = mergeSettingsRows(
      server as unknown as SettingsRowLike,
      clampSettingsRow(incoming, clamped, serverNow + MAX_FUTURE_MS),
    );
    if (merge.incomingWins.length === 0) {
      return { kind: "keep", ackUpdatedAt: server.updatedAt };
    }
    // Always past the server row, so every device pulls the change; one past
    // both rows when the server kept some of its own values, so the pushing
    // device takes those too.
    const updatedAt =
      merge.baseWins.length > 0
        ? merge.row.updatedAt + 1
        : Math.max(merge.row.updatedAt, server.updatedAt + 1);
    return {
      kind: "write",
      row: merge.row as unknown as Record<string, unknown>,
      updatedAt,
      guardUpdatedAt: server.updatedAt,
    };
  }

  // Rule 2b: a tombstone wins an exact tie with a live row.
  const tombstoneTie =
    !isTombstone(server) && isTombstone(incoming) && clamped === server.updatedAt;

  // Rule 2 / 3.
  if (clamped > server.updatedAt || tombstoneTie) {
    return { kind: "write", row: incoming, updatedAt: clamped, guardUpdatedAt: null };
  }
  return { kind: "keep", ackUpdatedAt: server.updatedAt };
}

/** What the server does with a pushed tombstone stub (`{id, updatedAt, deletedAt}`). */
export type TombstoneDecision =
  | { kind: "keep"; ackUpdatedAt: number }
  /** Mark the server row deleted at `deletedAt`, with `updatedAt`. */
  | { kind: "delete"; deletedAt: number; updatedAt: number };

/**
 * Decide a delete whose local row is already gone, so only a stub was sent.
 * It can only update an existing row: no server row, or one already deleted,
 * means the delete is satisfied. Otherwise the same rule as a full tombstone:
 * it wins when at least as new as the server row (rules 2 and 2b).
 */
export function resolveTombstone(input: {
  stub: { updatedAt: number; deletedAt: number };
  server: (SyncRow & { updatedAt: number }) | undefined;
  serverNow: number;
}): TombstoneDecision {
  const { stub, server, serverNow } = input;
  const clamped = clampUpdatedAt(stub.updatedAt, serverNow);
  if (!server || isTombstone(server)) {
    return { kind: "keep", ackUpdatedAt: server?.updatedAt ?? clamped };
  }
  if (clamped < server.updatedAt) return { kind: "keep", ackUpdatedAt: server.updatedAt };
  return { kind: "delete", deletedAt: stub.deletedAt, updatedAt: clamped };
}

/** What the device does with one pulled server row. */
export interface PullDecision {
  /** The row to store locally, or `null` to keep the local row as it is. */
  write: SyncRow | null;
  /** The local row holds changes the server lacks: queue it for push. */
  pushLocal: boolean;
}

/**
 * Decide a pulled server row against the local copy, so the device converges
 * on what the server keeps (audit sync-engine#1):
 *   - a server tombstone beats a live local row (rule 1);
 *   - a server live row beats a local tombstone only when strictly newer
 *     (rule 2b: the tombstone wins ties);
 *   - otherwise the strictly newer `updatedAt` wins, and a tie goes to the
 *     server (rule 3) unless a local edit is still queued.
 * A queued local edit does not block a strictly newer server row: the server
 * rejects the older edit anyway, and skipping the row while the cursor moves
 * past it would leave this device stale for good.
 *
 * Two live `userSettings` rows merge per setting, with the server as base:
 * the device takes every setting the server changed more recently and keeps
 * its own newer ones, which then need pushing.
 */
export function resolvePull(input: {
  tableName: string;
  pulled: SyncRow;
  local: SyncRow | undefined;
  hasPendingOp: boolean;
}): PullDecision {
  const { tableName, pulled, local, hasPendingOp } = input;
  if (!local) return { write: pulled, pushLocal: false };

  if (tableName === "userSettings" && !isTombstone(pulled) && !isTombstone(local)) {
    const merge = mergeSettingsRows(pulled as SettingsRowLike, local as SettingsRowLike);
    const pushLocal = merge.incomingWins.length > 0;
    if (merge.baseWins.length === 0) return { write: null, pushLocal };
    // A version the local row never had, so the settings mirror applies it.
    const updatedAt = Math.max(pulled.updatedAt ?? 0, (local.updatedAt ?? 0) + 1);
    return { write: { ...merge.row, updatedAt } as unknown as SyncRow, pushLocal };
  }

  return { write: pulledRowWins(pulled, local, hasPendingOp) ? pulled : null, pushLocal: false };
}

function pulledRowWins(pulled: SyncRow, local: SyncRow, hasPendingOp: boolean): boolean {
  if (isTombstone(pulled) && !isTombstone(local)) return true;
  const pulledAt = pulled.updatedAt ?? 0;
  const localAt = local.updatedAt ?? 0;
  if (pulledAt !== localAt) return pulledAt > localAt;
  if (isTombstone(local) && !isTombstone(pulled)) return false;
  return !hasPendingOp;
}
