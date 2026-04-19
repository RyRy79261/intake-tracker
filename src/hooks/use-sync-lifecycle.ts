"use client";

import { useEffect } from "react";
import { startEngine, stopEngine, detachLifecycleListeners } from "@/lib/sync-engine";

export function useSyncLifecycle(authenticated: boolean): void {
  useEffect(() => {
    if (!authenticated) return;
    startEngine();
    return () => {
      stopEngine();
      detachLifecycleListeners();
    };
  }, [authenticated]);
}
