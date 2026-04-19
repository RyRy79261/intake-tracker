"use client";

import { useSyncStatusStore } from "@/stores/sync-status-store";
import { Cloud, CloudOff, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncStatusBadge() {
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  const isSyncing = useSyncStatusStore((s) => s.isSyncing);
  const queueDepth = useSyncStatusStore((s) => s.queueDepth);
  const lastError = useSyncStatusStore((s) => s.lastError);

  if (lastError) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
        title={lastError}
      >
        <AlertTriangle className="h-3 w-3" />
        Sync error
      </span>
    );
  }

  if (!isOnline) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <CloudOff className="h-3 w-3" />
        Offline
      </span>
    );
  }

  if (isSyncing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing
      </span>
    );
  }

  if (queueDepth > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        <Cloud className="h-3 w-3" />
        {queueDepth} pending
      </span>
    );
  }

  return null;
}
