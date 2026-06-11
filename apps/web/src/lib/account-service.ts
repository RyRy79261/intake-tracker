/**
 * Account & storage-mode lifecycle actions that span the sync engine, the
 * server, and Neon Auth. Kept out of the React layer so the multi-step flows
 * stay testable.
 *
 * Two flows:
 *   - `switchToLocalAndWipeCloud` — download everything, then delete the cloud
 *     copy and drop to local-only. On-device data is preserved.
 *   - `deleteAccount` — scrub all server data, delete the Neon Auth identity,
 *     keep the on-device copy in local-only mode, and sign out.
 */
import { db } from "@/lib/db";
import { apiFetch } from "@/lib/api-fetch";
import { runPullCycle, stopEngine, startEngine } from "@/lib/sync-engine";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { authClient } from "@/lib/auth-client";
import { handleSignOut } from "@/lib/sign-out";

/**
 * Drop all local sync bookkeeping (pending op-log + pull cursors) and return to
 * local-only mode. Does NOT touch the user's data tables — those stay on the
 * device. Resetting the cursors means a future re-enable of cloud sync starts a
 * fresh full pull rather than resuming against a now-empty server.
 */
async function severSyncLink(): Promise<void> {
  await db._syncQueue.clear();
  await db._syncMeta.clear();
  useSyncStatusStore.setState({
    initialSyncComplete: false,
    isSyncing: false,
    queueDepth: 0,
    lastError: null,
  });
  useSettingsStore.getState().setStorageMode("local");
}

/**
 * Switch from cloud-sync back to local-only, wiping the server copy.
 *
 * Order matters: we pull the full dataset down BEFORE deleting it server-side,
 * and stop the engine BEFORE the wipe so the deletion can't round-trip back and
 * erase the local rows.
 */
export async function switchToLocalAndWipeCloud(): Promise<void> {
  // 1. Ensure IndexedDB holds a complete copy of the cloud dataset.
  await runPullCycle();
  // 2. Stop syncing so the upcoming server wipe doesn't propagate to local.
  stopEngine();
  // 3. Delete the cloud copy (synced tables + push subscriptions). If the wipe
  //    fails, nothing was deleted — restore cloud-sync before surfacing the
  //    error so the app isn't stranded with the engine stopped.
  let res: Response;
  try {
    res = await apiFetch("/api/sync/wipe", { method: "POST" });
  } catch (e) {
    startEngine();
    throw e;
  }
  if (!res.ok) {
    startEngine();
    throw new Error("Failed to wipe cloud data");
  }
  // 4. Local data stays; just sever the sync link and go local-only.
  await severSyncLink();
}

/**
 * Permanently delete the account: scrub all server data, delete the Neon Auth
 * login identity, keep this device's local copy, then sign out.
 */
export async function deleteAccount(): Promise<void> {
  // 1. Stop syncing before we touch the server.
  stopEngine();
  // 2. Scrub all server-side data while the session is still valid. If this
  //    fails, nothing was deleted — restore cloud-sync and surface the error.
  let res: Response;
  try {
    res = await apiFetch("/api/account/delete", { method: "POST" });
  } catch (e) {
    startEngine();
    throw e;
  }
  if (!res.ok) {
    startEngine();
    throw new Error("Failed to delete account data");
  }
  // Server data is now gone. Do NOT restart the sync engine past this point —
  // cloud-sync would push the still-present local copy back up to the server.

  // 3. Delete the Neon Auth login identity. If this fails, the data is already
  //    scrubbed but the account still exists, so surface it as a failure (the
  //    user stays signed in and can retry — re-running is idempotent) instead
  //    of silently reporting success.
  let deleteResult: Awaited<ReturnType<typeof authClient.deleteUser>> | undefined;
  try {
    deleteResult = await authClient.deleteUser({});
  } catch {
    throw new Error(
      "Your data was deleted, but removing your login failed. Please try again.",
    );
  }
  if (deleteResult?.error) {
    throw new Error(
      deleteResult.error.message ??
        "Your data was deleted, but removing your login failed. Please try again.",
    );
  }

  // 4. Identity removed. Keep local data in local-only mode, then sign out.
  await severSyncLink();
  await handleSignOut();
}
