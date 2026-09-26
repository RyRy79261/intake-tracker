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

/**
 * An op the push loop gave up on (server-rejected as invalid, or out of retry
 * budget). Its local Dexie row is untouched, but it never reached the server,
 * so it is kept here for the user to see instead of vanishing silently
 * (audit sync-engine#13).
 */
export interface DroppedSyncOp {
  tableName: string;
  recordId: string;
  error: string;
  droppedAt: number;
}

/** Newest-first cap on `droppedOps`, so a runaway failure can't grow it unbounded. */
export const MAX_DROPPED_OPS = 50;

export interface SyncStatus {
  // Persisted — last successful push/pull timestamps (Unix ms).
  lastPushedAt: number | null;
  lastPulledAt: number | null;
  // Persisted — true once a full pull-drain has completed on this device, i.e.
  // IndexedDB holds a complete copy of the cloud dataset. Stays true once set.
  initialSyncComplete: boolean;
  // Persisted — ops the push loop dropped, newest first (capped).
  droppedOps: DroppedSyncOp[];
  // Persisted — the user explicitly picked a storage mode on this device
  // (switched to local, cancelled a migration, deleted the account).
  // Auto-detect must never override an explicit choice (audit sync-engine#16).
  modeChosenByUser: boolean;
  // Ephemeral — runtime-only, reset on reload.
  isOnline: boolean;
  isSyncing: boolean;
  queueDepth: number;
  lastError: string | null;
  // Which loop set `lastError`. A successful pull only clears its own errors,
  // so a push failure is not wiped by the pull every push chains
  // (audit sync-engine#13).
  lastErrorSource: "push" | "pull" | null;
}

export interface SyncStatusActions {
  setOnline: (v: boolean) => void;
  setSyncing: (v: boolean) => void;
  setQueueDepth: (n: number) => void;
  setLastError: (e: string | null) => void;
  markPushed: () => void;
  markPulled: () => void;
  recordDroppedOps: (ops: DroppedSyncOp[]) => void;
  clearDroppedOps: () => void;
}

const defaultState: SyncStatus = {
  lastPushedAt: null,
  lastPulledAt: null,
  initialSyncComplete: false,
  droppedOps: [],
  modeChosenByUser: false,
  isOnline: true,
  isSyncing: false,
  queueDepth: 0,
  lastError: null,
  lastErrorSource: null,
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
      recordDroppedOps: (ops) =>
        set((state) => ({
          droppedOps: [...ops, ...state.droppedOps].slice(0, MAX_DROPPED_OPS),
        })),
      clearDroppedOps: () => set({ droppedOps: [] }),
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
      // Only timestamps, the parity flag, dropped ops and the explicit-mode
      // flag persist — the rest is ephemeral.
      partialize: (state) => ({
        lastPushedAt: state.lastPushedAt,
        lastPulledAt: state.lastPulledAt,
        initialSyncComplete: state.initialSyncComplete,
        droppedOps: state.droppedOps,
        modeChosenByUser: state.modeChosenByUser,
      }),
    },
  ),
);
