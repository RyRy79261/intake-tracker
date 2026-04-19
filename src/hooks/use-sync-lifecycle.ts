"use client";

import { useEffect } from "react";
import { startEngine, stopEngine, detachLifecycleListeners } from "@/lib/sync-engine";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

export function useSyncLifecycle(authenticated: boolean): void {
  const storageMode = useSettingsStore((s) => s.storageMode);

  useEffect(() => {
    if (!authenticated || storageMode !== "cloud-sync") {
      useSyncStatusStore.setState({ lastError: null, isSyncing: false });
      return;
    }
    startEngine();
    return () => {
      stopEngine();
      detachLifecycleListeners();
    };
  }, [authenticated, storageMode]);
}
