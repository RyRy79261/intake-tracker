"use client";

import { useEffect } from "react";
import { startEngine, stopEngine, detachLifecycleListeners } from "@/lib/sync-engine";
import { useSyncStatusStore } from "@/stores/sync-status-store";

export function useSyncLifecycle(authenticated: boolean): void {
  useEffect(() => {
    if (!authenticated) {
      useSyncStatusStore.setState({ lastError: null, isSyncing: false });
      return;
    }
    startEngine();
    return () => {
      stopEngine();
      detachLifecycleListeners();
    };
  }, [authenticated]);
}
