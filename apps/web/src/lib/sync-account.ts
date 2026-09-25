/**
 * Which account this device's sync state belongs to (audit sync-engine#11).
 *
 * The op-log (`_syncQueue`) and pull cursors (`_syncMeta`) are per device, not
 * per account, and sign-out keeps them (local-first: the on-device data stays).
 * Without a binding, a different account signing in on the same device would
 * push the previous account's pending ops into the new account and pull with
 * the previous account's cursors, skipping the new account's older rows.
 *
 * The binding is the last account whose sync ran here. {@link claimSyncAccount}
 * runs before the engine starts:
 *   - same account, or no binding yet (fresh device / pre-binding install) →
 *     bind and sync as usual;
 *   - different account with NOTHING pending → reset only the pull cursors
 *     (never user records) and rebind;
 *   - different account WITH pending ops → refuse. Those ops are the previous
 *     account's unsynced changes; they are kept until that account signs back
 *     in. Nothing is discarded without the user's say-so.
 */
import { db } from "@/lib/db";
import { useSyncStatusStore } from "@/stores/sync-status-store";

const STORAGE_KEY = "intake-sync-account";

export const SYNC_ACCOUNT_MISMATCH_ERROR =
  "Sync paused: this device has unsynced changes from another account. " +
  "Sign back in with that account to upload them.";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The userId this device's sync state belongs to, or null if never bound. */
export function getSyncAccountId(): string | null {
  return storage()?.getItem(STORAGE_KEY) ?? null;
}

function bind(userId: string): void {
  storage()?.setItem(STORAGE_KEY, userId);
}

export type SyncAccountClaim = "ok" | "switched" | "blocked";

/**
 * Bind this device's sync state to `userId` if it is safe to. Returns
 * "blocked" when another account's ops are still pending, in which case the
 * engine must not start.
 */
export async function claimSyncAccount(
  userId: string,
): Promise<SyncAccountClaim> {
  const bound = getSyncAccountId();
  if (bound === userId) return "ok";
  if (bound === null) {
    bind(userId);
    return "ok";
  }

  const pending = await db._syncQueue.count();
  if (pending > 0) {
    useSyncStatusStore.setState({ lastError: SYNC_ACCOUNT_MISMATCH_ERROR });
    return "blocked";
  }

  // Nothing of the previous account's is waiting to upload. Its cursors are
  // meaningless for the new account, so start its pull from scratch.
  await db._syncMeta.clear();
  useSyncStatusStore.setState({ initialSyncComplete: false, lastError: null });
  bind(userId);
  return "switched";
}
