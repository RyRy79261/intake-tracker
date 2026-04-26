"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Small persistent banner that surfaces when the device reports it is
 * offline. All record-taking still works — only AI-assisted lookups and
 * push notification subscription require the network.
 */
export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-1.5 px-3 py-1 text-[11px] font-medium bg-amber-100 text-amber-900 border-b border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800"
    >
      <WifiOff className="h-3 w-3" aria-hidden="true" />
      <span>Offline — all logging works locally. AI lookups will resume online.</span>
    </div>
  );
}
