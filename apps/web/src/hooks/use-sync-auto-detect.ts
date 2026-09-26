"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { queueLocalDataForSync } from "@/lib/migration-service";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

/**
 * On cold starts (new device, cleared localStorage), storageMode defaults to
 * "local" even if the user previously enabled cloud sync. This hook calls
 * /api/sync/status once to check if the server has data for this user, and
 * restores storageMode to "cloud-sync" if so.
 *
 * It never overrides a mode the user picked on this device (switched to
 * local, cancelled a migration): "local" is then a choice, not a default
 * (audit sync-engine#16). And before flipping to cloud-sync it queues every
 * record already on the device, so history written before the queue existed
 * (or imported from a backup) is uploaded rather than left behind.
 */
export function useSyncAutoDetect(authenticated: boolean): void {
  const storageMode = useSettingsStore((s) => s.storageMode);
  const setStorageMode = useSettingsStore((s) => s.setStorageMode);
  const modeChosenByUser = useSyncStatusStore((s) => s.modeChosenByUser);
  const checked = useRef(false);

  useEffect(() => {
    if (
      !authenticated ||
      storageMode !== "local" ||
      modeChosenByUser ||
      checked.current
    ) {
      return;
    }
    checked.current = true;

    apiFetch("/api/sync/status")
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (!data?.hasSyncedData) return;
        // The user may have picked a mode while the probe was in flight.
        if (useSyncStatusStore.getState().modeChosenByUser) return;
        await queueLocalDataForSync();
        setStorageMode("cloud-sync");
      })
      .catch(() => {
        // Silent failure — user stays on local mode, can re-enable manually
      });
  }, [authenticated, storageMode, modeChosenByUser, setStorageMode]);
}
