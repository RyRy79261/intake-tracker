"use client";

import { useSyncStatusStore } from "@/stores/sync-status-store";
import { WifiOff } from "lucide-react";

export function OfflineChip() {
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  const queueDepth = useSyncStatusStore((s) => s.queueDepth);

  if (isOnline) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-300">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        You&apos;re offline — changes are saved locally
        {queueDepth > 0 && ` (${queueDepth} pending)`}
      </span>
    </div>
  );
}
