"use client";

import { useEffect } from "react";
import { startEngine, detachLifecycleListeners } from "@/lib/sync-engine";

export function useSyncLifecycle(): void {
  useEffect(() => {
    startEngine();
    return () => {
      detachLifecycleListeners();
    };
  }, []);
}
