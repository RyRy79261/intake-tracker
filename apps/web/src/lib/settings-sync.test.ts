// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let mockSyncAccountId: string | null = null;
vi.mock("@/lib/sync-account", () => ({
  getSyncAccountId: () => mockSyncAccountId,
}));
vi.mock("@/lib/sync-engine", () => ({
  schedulePush: vi.fn(),
}));

import { db, type UserSettings } from "@/lib/db";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import {
  installSettingsSync,
  getActiveUserSettings,
  SEED_UPDATED_AT,
  PRE_SYNC_SETTINGS_BACKUP_KEY,
  SETTINGS_EDITED_AT_KEY,
} from "@/lib/settings-sync";

function settle(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function remoteRow(overrides: Partial<UserSettings> = {}): UserSettings {
  const initial = useSettingsStore.getInitialState();
  const now = Date.now();
  return {
    id: "user-a",
    waterLimit: initial.waterLimit,
    saltLimit: initial.saltLimit,
    sugarLimit: initial.sugarLimit,
    potassiumLimit: initial.potassiumLimit,
    waterExtendedBuffer: initial.waterExtendedBuffer,
    saltExtendedBuffer: initial.saltExtendedBuffer,
    sugarExtendedBuffer: initial.sugarExtendedBuffer,
    optionalTrackers: { ...initial.optionalTrackers },
    dayStartHour: initial.dayStartHour,
    liquidPresets: initial.liquidPresets as unknown as UserSettings["liquidPresets"],
    primaryRegion: initial.primaryRegion,
    secondaryRegion: initial.secondaryRegion,
    reminderFollowUpCount: initial.reminderFollowUpCount,
    reminderFollowUpInterval: initial.reminderFollowUpInterval,
    homeTimezone: null,
    homeTimezoneConfirmedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: "other-device",
    ...overrides,
  };
}

describe("settings-sync (audit state-settings-cache#2)", () => {
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    mockSyncAccountId = "user-a";
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useSettingsStore.setState({ storageMode: "local" });
    useSyncStatusStore.setState({ initialSyncComplete: false });
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it("writes a synced row, keyed by the account id, when a synced setting changes", async () => {
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setWaterLimit(1500);
    await settle();

    const rows = await db.userSettings.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("user-a");
    expect(rows[0]!.waterLimit).toBe(1500);
    expect(rows[0]!.updatedAt).toBeGreaterThan(SEED_UPDATED_AT);
    const queued = await db._syncQueue.toArray();
    expect(queued.map((q) => [q.tableName, q.recordId, q.op])).toEqual([
      ["userSettings", "user-a", "upsert"],
    ]);
  });

  it("keeps device-local preferences out of the synced row", async () => {
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setScrollDurationMs(700);
    useSettingsStore.getState().setTimeFormat("12h");
    await settle();

    expect(await db.userSettings.count()).toBe(0);
  });

  it("seeds the row from customised local settings, dated below any real edit", async () => {
    useSettingsStore.setState({
      saltLimit: 2000,
      dayStartHour: 4,
      optionalTrackers: { sugar: true, potassium: true },
    });

    dispose = installSettingsSync();
    await settle();

    const row = await getActiveUserSettings();
    expect(row).toBeDefined();
    expect(row!.saltLimit).toBe(2000);
    expect(row!.dayStartHour).toBe(4);
    expect(row!.optionalTrackers).toEqual({ sugar: true, potassium: true });
    expect(row!.updatedAt).toBe(SEED_UPDATED_AT);
    // The seed changes nothing in the store.
    expect(useSettingsStore.getState().saltLimit).toBe(2000);
  });

  it("does not seed a row when every synced setting is still the default", async () => {
    dispose = installSettingsSync();
    await settle();

    expect(await db.userSettings.count()).toBe(0);
  });

  it("applies a row pulled from another device to the store without echoing it back", async () => {
    dispose = installSettingsSync();
    await settle();

    await db.userSettings.put(remoteRow({ saltLimit: 2200, dayStartHour: 5 }));
    await settle();

    expect(useSettingsStore.getState().saltLimit).toBe(2200);
    expect(useSettingsStore.getState().dayStartHour).toBe(5);
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("keeps a local edit made while a newer row arrives, merged over that row", async () => {
    dispose = installSettingsSync();
    await settle();

    const put = db.userSettings.put(remoteRow({ saltLimit: 2200 }));
    useSettingsStore.getState().setWaterLimit(1700);
    await put;
    await settle();

    expect(useSettingsStore.getState().saltLimit).toBe(2200);
    expect(useSettingsStore.getState().waterLimit).toBe(1700);
    const row = await getActiveUserSettings();
    expect(row!.saltLimit).toBe(2200);
    expect(row!.waterLimit).toBe(1700);
  });

  it("keeps an edit that never reached the table (app closed first) over an older row", async () => {
    await db.userSettings.put(remoteRow({ saltLimit: 1500, updatedAt: Date.now() - 60_000 }));
    // Last session: the store (localStorage) saved the edit, the table write did not happen.
    useSettingsStore.setState({ saltLimit: 1900 });
    localStorage.setItem(SETTINGS_EDITED_AT_KEY, String(Date.now() - 1_000));

    dispose = installSettingsSync();
    await settle();

    expect(useSettingsStore.getState().saltLimit).toBe(1900);
    expect((await getActiveUserSettings())!.saltLimit).toBe(1900);
  });

  it("records when a synced setting was last edited on this device", async () => {
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setDayStartHour(4);

    expect(Number(localStorage.getItem(SETTINGS_EDITED_AT_KEY))).toBeGreaterThan(0);
  });

  it("adopts a row newer than this device's last edit", async () => {
    localStorage.setItem(SETTINGS_EDITED_AT_KEY, String(Date.now() - 60_000));
    useSettingsStore.setState({ saltLimit: 1900 });
    await db.userSettings.put(remoteRow({ saltLimit: 2300, updatedAt: Date.now() }));

    dispose = installSettingsSync();
    await settle();

    expect(useSettingsStore.getState().saltLimit).toBe(2300);
  });

  it("ignores tombstoned rows", async () => {
    dispose = installSettingsSync();
    await settle();

    await db.userSettings.put(remoteRow({ saltLimit: 2200, deletedAt: Date.now() }));
    await settle();

    expect(useSettingsStore.getState().saltLimit).toBe(1500);
    expect(await getActiveUserSettings()).toBeUndefined();
  });

  describe("cloud-sync before the first full pull", () => {
    beforeEach(() => {
      useSettingsStore.setState({ storageMode: "cloud-sync" });
      useSyncStatusStore.setState({ initialSyncComplete: false });
    });

    it("writes nothing until the initial sync completes, then adopts the cloud row and keeps local edits", async () => {
      dispose = installSettingsSync();
      await settle();

      useSettingsStore.getState().setSugarLimit(40);
      await settle();
      expect(await db.userSettings.count()).toBe(0);

      // The pull brings the settings another device saved.
      await db.userSettings.put(remoteRow({ waterLimit: 2000, sugarLimit: 30 }));
      useSyncStatusStore.setState({ initialSyncComplete: true });
      await settle();

      const state = useSettingsStore.getState();
      expect(state.waterLimit).toBe(2000);
      expect(state.sugarLimit).toBe(40);
      const row = await getActiveUserSettings();
      expect(row!.waterLimit).toBe(2000);
      expect(row!.sugarLimit).toBe(40);
    });

    it("keeps a copy of this device's differing settings before adopting the cloud copy", async () => {
      useSettingsStore.setState({ saltLimit: 1800 });
      dispose = installSettingsSync();
      await settle();
      // No seed yet: the cloud may already hold the user's settings.
      expect(await db.userSettings.count()).toBe(0);

      await db.userSettings.put(remoteRow({ saltLimit: 2400 }));
      useSyncStatusStore.setState({ initialSyncComplete: true });
      await settle();

      expect(useSettingsStore.getState().saltLimit).toBe(2400);
      const backup = JSON.parse(localStorage.getItem(PRE_SYNC_SETTINGS_BACKUP_KEY)!);
      expect(backup.settings.saltLimit).toBe(1800);
    });

    it("seeds from local settings when the cloud has no settings row yet", async () => {
      useSettingsStore.setState({ saltLimit: 1800 });
      dispose = installSettingsSync();
      await settle();

      useSyncStatusStore.setState({ initialSyncComplete: true });
      await settle();

      const row = await getActiveUserSettings();
      expect(row!.saltLimit).toBe(1800);
      expect(row!.updatedAt).toBe(SEED_UPDATED_AT);
    });
  });
});
