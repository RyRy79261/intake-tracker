"use client";

import { useSyncStatusStore } from "@/stores/sync-status-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useAuth } from "@/components/auth-guard";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type PulseState = "syncing" | "synced" | "offline" | "error";

const STATE_STYLES: Record<PulseState, { color: string; label: string }> = {
  syncing: { color: "bg-yellow-400", label: "Syncing changes…" },
  synced: { color: "bg-emerald-500", label: "All changes synced" },
  offline: { color: "bg-slate-400", label: "Offline — changes saved locally" },
  error: { color: "bg-red-500", label: "Sync error" },
};

/**
 * Floating sync status dot pinned to the top-left corner. Renders above
 * everything else and stays out of document flow so it never reflows content.
 * Pulses yellow while syncing (or while local writes are queued), settles to
 * green once the engine is caught up.
 */
export function SyncPulseIndicator() {
  const isSyncing = useSyncStatusStore((s) => s.isSyncing);
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  const queueDepth = useSyncStatusStore((s) => s.queueDepth);
  const lastError = useSyncStatusStore((s) => s.lastError);
  const storageMode = useSettingsStore((s) => s.storageMode);
  const { authenticated } = useAuth();
  const pathname = usePathname();

  // Only meaningful when the cloud-sync engine is actually running.
  if (storageMode !== "cloud-sync" || !authenticated || pathname?.startsWith("/auth")) {
    return null;
  }

  const state: PulseState = lastError
    ? "error"
    : !isOnline
      ? "offline"
      : isSyncing || queueDepth > 0
        ? "syncing"
        : "synced";

  const { color, label } = STATE_STYLES[state];
  const animated = state === "syncing";

  return (
    <div
      className="pointer-events-none fixed left-3 top-[calc(env(safe-area-inset-top,0px)_+_0.6rem)] z-[2147483647]"
      role="status"
      aria-label={label}
      title={label}
    >
      <span className="relative flex h-3 w-3">
        {animated && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              color,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-3 w-3 rounded-full ring-2 ring-white/70 transition-colors duration-500 dark:ring-slate-900/70",
            color,
          )}
        />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
