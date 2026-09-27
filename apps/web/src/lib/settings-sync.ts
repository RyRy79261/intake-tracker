/**
 * Mirrors the user's settings between the Zustand settings store and the
 * synced `userSettings` table (audit state-settings-cache#2,
 * gap-timezone-travel-recalc#1).
 *
 * The split
 * ---------
 * Settings that describe the USER are synced (SYNCED_SETTING_KEYS): daily
 * limits and extended buffers, optional trackers, the day-start hour, the
 * week start, liquid presets, medication regions, reminder follow-up
 * count/interval and the home timezone. They decide what is recorded and how a day is counted, so every
 * device has to agree on them, and a backup has to carry them.
 *
 * Settings that describe the DEVICE stay in localStorage only: theme
 * (next-themes), animation timing, swipe and quick-nav, shake-to-report, the
 * clock format, the +/- increments and default amounts, the analytics intro
 * flag, `storageMode` and `doseRemindersEnabled` (each device has its own
 * push subscription).
 *
 * The store stays the in-memory API: components keep calling its setters,
 * and service code keeps reading `useSettingsStore.getState()`. This module
 * writes synced-key changes to the table and applies rows arriving from
 * elsewhere (a pull, a backup restore, another tab) back to the store.
 *
 * Conflicts
 * ---------
 * Per setting, not per row. Each row carries `fieldUpdatedAt`: when each
 * setting last changed. Every write stamps the settings it changed and keeps
 * the other stamps (stampChangedSettings). The push route and the pull merge
 * two versions of the row setting by setting (lib/settings-merge.ts), so two
 * devices editing different settings while both offline both keep their
 * edit; the same setting edited on both resolves to the later edit. Rows
 * without stamps (older clients) count every setting as changed at their
 * `updatedAt`. Locally, keys edited on this device but not yet written are
 * kept when a newer row is adopted (they are merged over it and written
 * back).
 *
 * An edit the store saved but the table never received (the app closed
 * first) is recognised on the next start by the per-key stamps in
 * SETTINGS_EDITED_AT_KEY: each key whose local stamp is newer than that
 * setting's stamp in the row keeps its local value and is written; every
 * other key takes the row's value.
 *
 * First run
 * ---------
 * No row exists yet on upgrade. In local mode the row is seeded at once from
 * the store. In cloud-sync mode, while this device has no row, nothing is
 * written until a full pull has finished during this page load: the cloud may
 * already hold the settings another device saved, and the persisted
 * initialSyncComplete flag of an upgraded device predates the table. If a
 * row is then found it is adopted. Whenever a row replaces values that no
 * real edit wrote (this device's never-synced settings, or its own seed),
 * those values are copied to localStorage (PRE_SYNC_SETTINGS_BACKUP_KEY)
 * first, so nothing is lost. A seeded row is written only when some synced
 * value differs from the default, and carries `updatedAt = SEED_UPDATED_AT`,
 * so any setting the user actually saves on any device outranks it.
 */
import { liveQuery, type Subscription } from "dexie";
import { db, type UserSettings, type SyncedLiquidPreset } from "@/lib/db";
import type { LiquidPreset } from "@/lib/constants";
import { useSettingsStore, type Settings } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { writeWithSync } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import { getSyncAccountId } from "@/lib/sync-account";
import { generateId, getDeviceId } from "@/lib/utils";
import { settingStamp, stampChangedSettings } from "@/lib/settings-merge";
import { isWeekStartsOn } from "@/lib/week-start";

/** The settings that live in the synced `userSettings` row. */
export const SYNCED_SETTING_KEYS = [
  "waterLimit",
  "saltLimit",
  "sugarLimit",
  "potassiumLimit",
  "waterExtendedBuffer",
  "saltExtendedBuffer",
  "sugarExtendedBuffer",
  "optionalTrackers",
  "dayStartHour",
  "weekStartsOn",
  "liquidPresets",
  "primaryRegion",
  "secondaryRegion",
  "reminderFollowUpCount",
  "reminderFollowUpInterval",
  "homeTimezone",
  "homeTimezoneConfirmedAt",
] as const satisfies ReadonlyArray<keyof Settings & keyof UserSettings>;

export type SyncedSettingKey = (typeof SYNCED_SETTING_KEYS)[number];

/**
 * Synced settings added after `userSettings` rows already existed. A row
 * without one predates it (the key is simply absent), so this device's value
 * for it is a default, not an edit. (Nullable settings are not listed: a
 * pulled row drops null columns, so their absence proves nothing.)
 */
const SETTINGS_ADDED_AFTER_ROWS: readonly SyncedSettingKey[] = ["weekStartsOn"];
export type SyncedSettings = Pick<Settings, SyncedSettingKey>;

/**
 * `updatedAt` of a row seeded from a device's local settings. Lower than any
 * real edit, so a value the user saved anywhere wins last-write-wins.
 */
export const SEED_UPDATED_AT = 1;

/**
 * localStorage key holding this device's own synced settings as they were
 * just before it adopted a different cloud copy. Written once, never read by
 * the app — a manual recovery copy.
 */
export const PRE_SYNC_SETTINGS_BACKUP_KEY = "intake-tracker-settings-pre-sync";

/**
 * localStorage key holding when each synced setting was last edited on this
 * device (JSON `{ [key]: Unix ms }`). The store persists an edit
 * synchronously but the table write is async, and in cloud-sync mode it waits
 * for a pull; if the app closes in between, these stamps let the next start
 * tell a newer local edit from an older row. Per key, so one recent edit (or
 * the home timezone the travel check records at startup) does not make every
 * other stale local value outrank the row.
 */
export const SETTINGS_EDITED_AT_KEY = "intake-tracker-settings-edited-at";

type EditedAtMap = Partial<Record<SyncedSettingKey, number>>;

function readEditedAt(): EditedAtMap {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_EDITED_AT_KEY);
    if (raw == null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: EditedAtMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isSyncedSettingKey(key) && isFiniteNumber(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeEditedAt(keys: Iterable<SyncedSettingKey>, at: number): void {
  try {
    const map = readEditedAt();
    for (const key of keys) map[key] = at;
    globalThis.localStorage?.setItem(SETTINGS_EDITED_AT_KEY, JSON.stringify(map));
  } catch {
    // Storage blocked: only the close-before-write case loses its edge.
  }
}

const SYNCED_KEY_SET: ReadonlySet<string> = new Set(SYNCED_SETTING_KEYS);

export function isSyncedSettingKey(key: string): key is SyncedSettingKey {
  return SYNCED_KEY_SET.has(key);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The synced settings out of a full store state. */
export function pickSyncedSettings(state: Settings): SyncedSettings {
  const out: Record<string, unknown> = {};
  for (const key of SYNCED_SETTING_KEYS) out[key] = state[key];
  return out as SyncedSettings;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * The synced settings a row carries, validated field by field. A missing or
 * malformed field (a row written by an older or newer client) is left out,
 * so the store keeps its own value for it.
 */
export function settingsFromRow(
  row: Partial<UserSettings> | Record<string, unknown>,
): Partial<SyncedSettings> {
  const r = row as Record<string, unknown>;
  const out: Partial<Record<SyncedSettingKey, unknown>> = {};
  for (const key of [
    "waterLimit",
    "saltLimit",
    "sugarLimit",
    "potassiumLimit",
    "waterExtendedBuffer",
    "saltExtendedBuffer",
    "sugarExtendedBuffer",
    "reminderFollowUpCount",
    "reminderFollowUpInterval",
  ] as const) {
    if (isFiniteNumber(r[key])) out[key] = r[key];
  }
  if (isFiniteNumber(r.dayStartHour) && r.dayStartHour >= 0 && r.dayStartHour <= 23) {
    out.dayStartHour = r.dayStartHour;
  }
  if (isWeekStartsOn(r.weekStartsOn)) out.weekStartsOn = r.weekStartsOn;
  const trackers = r.optionalTrackers as Record<string, unknown> | undefined;
  if (
    trackers &&
    typeof trackers === "object" &&
    typeof trackers.sugar === "boolean" &&
    typeof trackers.potassium === "boolean"
  ) {
    out.optionalTrackers = { sugar: trackers.sugar, potassium: trackers.potassium };
  }
  if (
    Array.isArray(r.liquidPresets) &&
    r.liquidPresets.every(
      (p) =>
        p !== null &&
        typeof p === "object" &&
        typeof (p as Record<string, unknown>).id === "string" &&
        typeof (p as Record<string, unknown>).name === "string",
    )
  ) {
    out.liquidPresets = r.liquidPresets as unknown as LiquidPreset[];
  }
  for (const key of ["primaryRegion", "secondaryRegion"] as const) {
    if (typeof r[key] === "string") out[key] = r[key];
  }
  if (r.homeTimezone === null || typeof r.homeTimezone === "string") {
    out.homeTimezone = r.homeTimezone || null;
  }
  if (r.homeTimezoneConfirmedAt === null || isFiniteNumber(r.homeTimezoneConfirmedAt)) {
    out.homeTimezoneConfirmedAt = r.homeTimezoneConfirmedAt;
  }
  return out as Partial<SyncedSettings>;
}

/** Build a `userSettings` row holding `values`. */
export function buildUserSettingsRow(
  values: SyncedSettings,
  opts: {
    id?: string | undefined;
    createdAt?: number | undefined;
    updatedAt: number;
    /** Per-setting change stamps; omitted = every setting at `updatedAt`. */
    fieldUpdatedAt?: Record<string, number> | undefined;
  },
): UserSettings {
  const now = Date.now();
  return {
    // A new row takes the account's id, so two devices creating one converge
    // on the same row (as the medical profile does).
    id: opts.id ?? getSyncAccountId() ?? generateId(),
    ...values,
    liquidPresets: values.liquidPresets as unknown as SyncedLiquidPreset[],
    ...(opts.fieldUpdatedAt !== undefined && { fieldUpdatedAt: opts.fieldUpdatedAt }),
    createdAt: opts.createdAt ?? now,
    updatedAt: opts.updatedAt,
    deletedAt: null,
    deviceId: getDeviceId(),
  };
}

/**
 * The `userSettings` row an older backup implies. Backups written before the
 * table existed carry only `settings: { state }`, the raw settings-store
 * blob. Its synced keys are laid over `base` (the current row, or the
 * store), so a key the blob lacks keeps its current value; device-only keys
 * are ignored. The row keeps `base`'s id, so a differing local row surfaces
 * as an import conflict instead of a second row. Returns undefined when the
 * blob holds no synced setting.
 */
export function userSettingsFromLegacyBlob(
  blob: unknown,
  base: { row?: UserSettings | undefined; settings: SyncedSettings },
  exportedAt: number,
): UserSettings | undefined {
  const state = (blob as { state?: unknown } | null | undefined)?.state;
  if (!state || typeof state !== "object") return undefined;
  const restored = settingsFromRow(state as Record<string, unknown>);
  if (Object.keys(restored).length === 0) return undefined;
  return buildUserSettingsRow(
    { ...base.settings, ...restored },
    {
      id: base.row?.id,
      createdAt: base.row?.createdAt ?? exportedAt,
      updatedAt: exportedAt,
    },
  );
}

/**
 * The user's settings row: the newest live row, or undefined when none
 * exists. Several live rows can exist after two devices each created one
 * before syncing; the newest wins.
 */
export async function getActiveUserSettings(): Promise<UserSettings | undefined> {
  const rows = await db.userSettings.toArray();
  return rows
    .filter((r) => r.deletedAt == null)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0];
}

function defaultSyncedSettings(): SyncedSettings {
  return pickSyncedSettings(useSettingsStore.getInitialState());
}

function savePreSyncBackup(values: SyncedSettings): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage || storage.getItem(PRE_SYNC_SETTINGS_BACKUP_KEY) !== null) return;
    storage.setItem(
      PRE_SYNC_SETTINGS_BACKUP_KEY,
      JSON.stringify({ savedAt: Date.now(), settings: values }),
    );
  } catch {
    // Storage full or blocked: the adopted cloud copy still applies.
  }
}

// deviceId is part of the version: two devices' seeds share the account id
// and SEED_UPDATED_AT, and must still be told apart.
type RowVersion = { id: string; updatedAt: number; deviceId: string };

const versionOf = (row: UserSettings): RowVersion => ({
  id: row.id,
  updatedAt: row.updatedAt,
  deviceId: row.deviceId,
});

/** When this page load started (Unix ms). */
function sessionStart(): number {
  const origin = globalThis.performance?.timeOrigin;
  return isFiniteNumber(origin) && origin > 0 ? origin : Date.now();
}

/**
 * Start mirroring. Returns a disposer. Install once, at app start (see
 * providers.tsx).
 */
export function installSettingsSync(): () => void {
  let disposed = false;
  // False until the first reconcile has run. Before that, edits are only
  // recorded in `dirty`.
  let ready = false;
  // Synced keys edited on this device and not yet written to the table.
  const dirty = new Set<SyncedSettingKey>();
  // Set while this module itself writes to the store, so that write is not
  // mistaken for a user edit.
  let applying = false;
  // The row version the store currently reflects.
  let lastSeen: RowVersion | null = null;
  // True once a full pull has finished during this page load. The persisted
  // initialSyncComplete flag predates the userSettings table on an upgraded
  // device, so it does not prove the cloud's settings row has been pulled.
  const startedAt = sessionStart();
  const pulledAtStart = useSyncStatusStore.getState().lastPulledAt;
  let pulledThisSession = pulledAtStart != null && pulledAtStart >= startedAt;

  // Every read-modify-write runs in this chain, one at a time.
  let chain: Promise<void> = Promise.resolve();
  const run = (task: () => Promise<void>): void => {
    chain = chain
      .then(() => (disposed ? undefined : task()))
      .catch((error) => console.error("[settings-sync]", error));
  };

  const isLastSeen = (row: UserSettings) =>
    lastSeen !== null &&
    lastSeen.id === row.id &&
    lastSeen.updatedAt === row.updatedAt &&
    lastSeen.deviceId === row.deviceId;

  /** Apply a row to the store, keeping keys edited here but not yet written. */
  const adopt = (row: UserSettings): void => {
    const incoming = settingsFromRow(row);
    const current = pickSyncedSettings(useSettingsStore.getState());
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (dirty.has(key as SyncedSettingKey)) continue;
      if (!same(current[key as SyncedSettingKey], value)) changes[key] = value;
    }
    // Replacing values no real edit ever wrote (this device's never-synced
    // settings, or its seed): keep a copy of them first.
    if (
      Object.keys(changes).length > 0 &&
      (lastSeen === null || lastSeen.updatedAt === SEED_UPDATED_AT) &&
      !same(current, defaultSyncedSettings())
    ) {
      savePreSyncBackup(current);
    }
    lastSeen = versionOf(row);
    if (Object.keys(changes).length === 0) return;
    applying = true;
    try {
      useSettingsStore.setState(changes as Partial<Settings>);
    } finally {
      applying = false;
    }
  };

  /** Write the store's synced settings to the table, if they changed. */
  const writeCurrent = async (seed = false): Promise<void> => {
    const existing = await getActiveUserSettings();
    if (disposed) return;
    // A newer row this device has not applied yet: take it first, so this
    // write only carries the keys edited here.
    if (existing && !isLastSeen(existing)) adopt(existing);
    const values = pickSyncedSettings(useSettingsStore.getState());
    const edited = new Set(dirty);
    dirty.clear();
    if (existing && same(settingsFromRow(existing), values)) {
      lastSeen = versionOf(existing);
      return;
    }
    const updatedAt = seed
      ? SEED_UPDATED_AT
      : Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1);
    // The settings this write changes are stamped now; the others keep the
    // row's stamps, so a merge does not mistake them for new edits.
    const fieldUpdatedAt = stampChangedSettings(existing, values, updatedAt);
    // A setting the row predates (written before it existed) that nobody
    // edited here carries only this device's local value: stamp it as a
    // seed, so any real choice made on another device outranks it.
    if (existing) {
      for (const key of SETTINGS_ADDED_AFTER_ROWS) {
        if (!Object.prototype.hasOwnProperty.call(existing, key) && !edited.has(key)) {
          fieldUpdatedAt[key] = SEED_UPDATED_AT;
        }
      }
    }
    const row = buildUserSettingsRow(values, {
      id: existing?.id,
      createdAt: existing?.createdAt,
      updatedAt,
      fieldUpdatedAt,
    });
    lastSeen = versionOf(row);
    await writeWithSync("userSettings", "upsert", async () => {
      await db.userSettings.put(row);
      return row;
    });
    schedulePush();
  };

  /** Cloud-sync mode must see the cloud copy before writing anything. */
  const mayWrite = (): boolean =>
    useSettingsStore.getState().storageMode !== "cloud-sync" ||
    useSyncStatusStore.getState().initialSyncComplete;

  const reconcile = async (): Promise<void> => {
    if (ready || !mayWrite()) return;
    const row = await getActiveUserSettings();
    if (ready || disposed) return;
    // No local row in cloud-sync mode: the cloud may still hold one this
    // device has never pulled (the table is new to an upgraded device whose
    // initialSyncComplete was persisted long ago). Wait for a pull.
    if (
      !row &&
      useSettingsStore.getState().storageMode === "cloud-sync" &&
      !pulledThisSession
    ) {
      return;
    }
    ready = true;
    const editedAt = readEditedAt();
    if (row) {
      const local = pickSyncedSettings(useSettingsStore.getState());
      const incoming = settingsFromRow(row);
      // Keys edited here after the row last changed them: those values are
      // newer.
      for (const [key, value] of Object.entries(incoming)) {
        const stamp = editedAt[key as SyncedSettingKey];
        if (
          stamp !== undefined &&
          stamp > settingStamp(row, key) &&
          !same(local[key as SyncedSettingKey], value)
        ) {
          dirty.add(key as SyncedSettingKey);
        }
      }
      // A setting the row predates cannot have been written by it, so any
      // edit of it recorded here never reached the table.
      for (const key of SETTINGS_ADDED_AFTER_ROWS) {
        if (
          editedAt[key] !== undefined &&
          !Object.prototype.hasOwnProperty.call(row, key)
        ) {
          dirty.add(key);
        }
      }
      // adopt() keeps a copy of the local values it replaces.
      adopt(row);
      if (dirty.size > 0) await writeCurrent();
      return;
    }
    if (dirty.size > 0 || Object.keys(editedAt).length > 0) {
      await writeCurrent();
      return;
    }
    const local = pickSyncedSettings(useSettingsStore.getState());
    if (!same(local, defaultSyncedSettings())) await writeCurrent(true);
  };

  const unsubscribeStore = useSettingsStore.subscribe((state, prev) => {
    if (!ready && state.storageMode !== prev.storageMode) run(reconcile);
    if (applying) return;
    const changed: SyncedSettingKey[] = [];
    for (const key of SYNCED_SETTING_KEYS) {
      if (!same(state[key], prev[key])) {
        dirty.add(key);
        changed.push(key);
      }
    }
    if (changed.length === 0) return;
    writeEditedAt(changed, Date.now());
    if (ready) run(() => writeCurrent());
  });

  const unsubscribeSync = useSyncStatusStore.subscribe((state, prev) => {
    if (state.lastPulledAt !== prev.lastPulledAt && state.initialSyncComplete) {
      pulledThisSession = true;
    }
    if (ready) return;
    if (
      (state.initialSyncComplete && !prev.initialSyncComplete) ||
      state.lastPulledAt !== prev.lastPulledAt
    ) {
      run(reconcile);
    }
  });

  // Rows written elsewhere: a pull, a backup restore, another tab.
  const subscription: Subscription = liveQuery(getActiveUserSettings).subscribe({
    next: (row) => {
      if (!ready || !row || isLastSeen(row)) return;
      run(async () => {
        // Re-read inside the chain: the emission may predate a local write.
        const fresh = await getActiveUserSettings();
        if (fresh && !isLastSeen(fresh)) adopt(fresh);
      });
    },
    error: (error) => console.error("[settings-sync] Observer failed:", error),
  });

  run(reconcile);

  return () => {
    disposed = true;
    unsubscribeStore();
    unsubscribeSync();
    subscription.unsubscribe();
  };
}
