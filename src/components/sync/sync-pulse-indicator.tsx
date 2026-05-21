"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useAuth } from "@/components/auth-guard";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type PulseState = "syncing" | "synced" | "offline" | "error";

const COLOR: Record<PulseState, string> = {
  syncing: "bg-yellow-400",
  synced: "bg-emerald-500",
  offline: "bg-slate-400",
  error: "bg-red-500",
};

// How long the text label lingers before fading away — toast-like, brief.
const LABEL_DURATION_MS = 1800;

/**
 * Sync status dot pinned flush to the dead top-left corner — only a quarter
 * of the circle is visible. Renders above everything and stays out of
 * document flow, so it never reflows content. Pulses yellow while syncing,
 * settles to green once caught up. Tapping it (or the start of a sync) flashes
 * a small label with the current status, which auto-dismisses.
 */
export function SyncPulseIndicator() {
  const isSyncing = useSyncStatusStore((s) => s.isSyncing);
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  const queueDepth = useSyncStatusStore((s) => s.queueDepth);
  const lastError = useSyncStatusStore((s) => s.lastError);
  const initialSyncComplete = useSyncStatusStore((s) => s.initialSyncComplete);
  const storageMode = useSettingsStore((s) => s.storageMode);
  const { authenticated } = useAuth();
  const pathname = usePathname();

  const [labelVisible, setLabelVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasSyncing = useRef(false);

  const flashLabel = useCallback(() => {
    setLabelVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setLabelVisible(false), LABEL_DURATION_MS);
  }, []);

  // Flash the label whenever a sync cycle starts.
  useEffect(() => {
    if (isSyncing && !wasSyncing.current) flashLabel();
    wasSyncing.current = isSyncing;
  }, [isSyncing, flashLabel]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // Only meaningful when the cloud-sync engine is actually running.
  if (storageMode !== "cloud-sync" || !authenticated || pathname?.startsWith("/auth")) {
    return null;
  }

  // `!initialSyncComplete` keeps the dot in the syncing state until the first
  // full pull has downloaded a complete copy of the cloud data — otherwise a
  // fresh device flashes green "synced" before the pull cycle even starts.
  const state: PulseState = lastError
    ? "error"
    : !isOnline
      ? "offline"
      : isSyncing || queueDepth > 0 || !initialSyncComplete
        ? "syncing"
        : "synced";

  const label =
    state === "syncing"
      ? !initialSyncComplete
        ? "Downloading your data…"
        : queueDepth > 0
          ? `Syncing ${queueDepth} ${queueDepth === 1 ? "change" : "changes"}…`
          : "Syncing…"
      : state === "synced"
        ? "All changes synced"
        : state === "offline"
          ? "Offline — changes saved locally"
          : "Sync error";

  const animated = state === "syncing";

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[2147483647]">
      {/* Tap target sits in the dead corner; only a quarter of the dot shows. */}
      <button
        type="button"
        onClick={flashLabel}
        aria-label={label}
        className="pointer-events-auto absolute left-0 top-0 h-7 w-7"
      >
        <span className="absolute left-0 top-0 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2">
          {animated && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                COLOR[state],
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-5 w-5 rounded-full ring-1 ring-white/60 transition-colors duration-500 dark:ring-slate-900/60",
              COLOR[state],
            )}
          />
        </span>
      </button>

      <span
        role="status"
        aria-hidden={!labelVisible}
        className={cn(
          "absolute left-4 top-1 whitespace-nowrap rounded-md bg-slate-900/85 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm transition-all duration-300 dark:bg-slate-100/90 dark:text-slate-900",
          labelVisible ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
        )}
      >
        {label}
      </span>
    </div>
  );
}
