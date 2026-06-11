/**
 * Sync engine status store (Phase 43 D-14).
 *
 * Shape: `{lastPushedAt, lastPulledAt, isOnline, isSyncing, queueDepth, lastError}`
 * plus setters. Persisted fields (`lastPushedAt`, `lastPulledAt`) survive
 * reload via localStorage; ephemeral fields reset to defaults on reload.
 *
 * Mirrors the `src/stores/settings-store.ts` Zustand + `persist` pattern.
 *
 * Refs:
 * - `.planning/phases/43-sync-engine-core/43-CONTEXT.md` §D-14
 * - `.planning/phases/43-sync-engine-core/43-PATTERNS.md` §"src/stores/sync-status-store.ts"
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SyncStatus {
  // Persisted — last successful push/pull timestamps (Unix ms).
  lastPushedAt: number | null;
  lastPulledAt: number | null;
  // Persisted — true once a full pull-drain has completed on this device, i.e.
  // IndexedDB holds a complete copy of the cloud dataset. Stays true once set.
  initialSyncComplete: boolean;
  // Ephemeral — runtime-only, reset on reload.
  isOnline: boolean;
  isSyncing: boolean;
  queueDepth: number;
  lastError: string | null;
}

export interface SyncStatusActions {
  setOnline: (v: boolean) => void;
  setSyncing: (v: boolean) => void;
  setQueueDepth: (n: number) => void;
  setLastError: (e: string | null) => void;
  markPushed: () => void;
  markPulled: () => void;
}

const defaultState: SyncStatus = {
  lastPushedAt: null,
  lastPulledAt: null,
  initialSyncComplete: false,
  isOnline: true,
  isSyncing: false,
  queueDepth: 0,
  lastError: null,
};

export const useSyncStatusStore = create<SyncStatus & SyncStatusActions>()(
  persist(
    (set) => ({
      ...defaultState,

      setOnline: (v) => set({ isOnline: v }),
      setSyncing: (v) => set({ isSyncing: v }),
      setQueueDepth: (n) => set({ queueDepth: n }),
      setLastError: (e) => set({ lastError: e }),
      markPushed: () => set({ lastPushedAt: Date.now() }),
      markPulled: () => set({ lastPulledAt: Date.now() }),
    }),
    {
      name: "intake-tracker-sync-status",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // Pre-existing cloud-sync users have already pulled their data;
          // a non-null lastPulledAt means this device is already in parity.
          state.initialSyncComplete = state.lastPulledAt != null;
        }
        return state as unknown as SyncStatus & SyncStatusActions;
      },
      // Only timestamps + the parity flag persist — the rest is ephemeral.
      partialize: (state) => ({
        lastPushedAt: state.lastPushedAt,
        lastPulledAt: state.lastPulledAt,
        initialSyncComplete: state.initialSyncComplete,
      }),
    },
  ),
);
