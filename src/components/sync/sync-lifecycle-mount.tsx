"use client";

import { useSyncLifecycle } from "@/hooks/use-sync-lifecycle";

export function SyncLifecycleMount() {
  useSyncLifecycle();
  return null;
}
