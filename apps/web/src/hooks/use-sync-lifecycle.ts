"use client";

import { useEffect } from "react";
import { startEngine, stopEngine, detachLifecycleListeners } from "@/lib/sync-engine";
import { claimSyncAccount } from "@/lib/sync-account";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

export function useSyncLifecycle(
  authenticated: boolean,
  userId: string | null = null,
): void {
  const storageMode = useSettingsStore((s) => s.storageMode);

  useEffect(() => {
    if (!authenticated || storageMode !== "cloud-sync") {
      useSyncStatusStore.setState({ lastError: null, isSyncing: false });
      return;
    }
    let cancelled = false;
    // Never sync another account's queue/cursors into this one
    // (audit sync-engine#11) — see sync-account.ts.
    void (async () => {
      if (userId && (await claimSyncAccount(userId)) === "blocked") return;
      if (!cancelled) startEngine();
    })();
    return () => {
      cancelled = true;
      stopEngine();
      detachLifecycleListeners();
    };
  }, [authenticated, storageMode, userId]);
}
