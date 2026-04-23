"use client";

import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * On cold starts (new device, cleared localStorage), storageMode defaults to
 * "local" even if the user previously enabled cloud sync. This hook calls
 * /api/sync/status once to check if the server has data for this user, and
 * restores storageMode to "cloud-sync" if so.
 */
export function useSyncAutoDetect(authenticated: boolean): void {
  const storageMode = useSettingsStore((s) => s.storageMode);
  const setStorageMode = useSettingsStore((s) => s.setStorageMode);
  const checked = useRef(false);

  useEffect(() => {
    if (!authenticated || storageMode !== "local" || checked.current) return;
    checked.current = true;

    fetch("/api/sync/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.hasSyncedData) {
          setStorageMode("cloud-sync");
        }
      })
      .catch(() => {
        // Silent failure — user stays on local mode, can re-enable manually
      });
  }, [authenticated, storageMode, setStorageMode]);
}
