// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let mockSyncAccountId: string | null = null;
vi.mock("@/lib/sync-account", () => ({
  getSyncAccountId: () => mockSyncAccountId,
}));
vi.mock("@/lib/sync-engine", () => ({
  schedulePush: vi.fn(),
}));

import {
  createPreviewDatabase,
  db,
  resetActiveDatabase,
  setActiveDatabase,
  type UserSettings,
} from "@/lib/db";
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

/** What the sync engine does when a full pull finishes. */
function completePull(): void {
  useSyncStatusStore.setState({ initialSyncComplete: true, lastPulledAt: Date.now() });
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
    weekStartsOn: initial.weekStartsOn,
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
    useSyncStatusStore.setState({ initialSyncComplete: false, lastPulledAt: null });
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
    localStorage.setItem(SETTINGS_EDITED_AT_KEY, JSON.stringify({ saltLimit: Date.now() - 1_000 }));

    dispose = installSettingsSync();
    await settle();

    expect(useSettingsStore.getState().saltLimit).toBe(1900);
    expect((await getActiveUserSettings())!.saltLimit).toBe(1900);
  });

  // Per-setting conflict resolution: the row records when each setting
  // changed, so a merge keeps both devices' edits to different settings.
  it("stamps only the settings an edit changed", async () => {
    const earlier = Date.now() - 60_000;
    const stamps = Object.fromEntries(
      Object.keys(remoteRow()).map((k) => [k, earlier]),
    );
    await db.userSettings.put(remoteRow({ updatedAt: earlier, fieldUpdatedAt: stamps }));
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setWaterLimit(1500);
    await settle();

    const row = (await getActiveUserSettings())!;
    expect(row.waterLimit).toBe(1500);
    expect(row.fieldUpdatedAt!.waterLimit).toBe(row.updatedAt);
    expect(row.fieldUpdatedAt!.waterLimit).toBeGreaterThan(earlier);
    expect(row.fieldUpdatedAt!.saltLimit).toBe(earlier);
    expect(row.fieldUpdatedAt!.dayStartHour).toBe(earlier);
  });

  it("stamps every synced setting on the first row", async () => {
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setWaterLimit(1500);
    await settle();

    const row = (await getActiveUserSettings())!;
    expect(Object.keys(row.fieldUpdatedAt!).sort()).toEqual(
      [
        "waterLimit", "saltLimit", "sugarLimit", "potassiumLimit",
        "waterExtendedBuffer", "saltExtendedBuffer", "sugarExtendedBuffer",
        "optionalTrackers", "dayStartHour", "weekStartsOn", "liquidPresets", "primaryRegion",
        "secondaryRegion", "reminderFollowUpCount", "reminderFollowUpInterval",
        "homeTimezone", "homeTimezoneConfirmedAt",
      ].sort(),
    );
    expect(new Set(Object.values(row.fieldUpdatedAt!))).toEqual(new Set([row.updatedAt]));
  });

  it("keeps an unwritten edit newer than that setting's stamp, even under a newer row", async () => {
    const now = Date.now();
    // Another device edited only the water limit, just now; the sodium
    // limit in its row dates from two minutes ago.
    await db.userSettings.put(
      remoteRow({
        waterLimit: 2600,
        saltLimit: 1500,
        updatedAt: now,
        fieldUpdatedAt: { waterLimit: now, saltLimit: now - 120_000 },
      }),
    );
    // Last session this device changed the sodium limit a minute ago; the
    // table write never happened.
    useSettingsStore.setState({ saltLimit: 1900 });
    localStorage.setItem(SETTINGS_EDITED_AT_KEY, JSON.stringify({ saltLimit: now - 60_000 }));

    dispose = installSettingsSync();
    await settle();

    expect(useSettingsStore.getState().saltLimit).toBe(1900);
    expect(useSettingsStore.getState().waterLimit).toBe(2600);
    const row = (await getActiveUserSettings())!;
    expect(row.saltLimit).toBe(1900);
    expect(row.waterLimit).toBe(2600);
  });

  it("records when a synced setting was last edited on this device", async () => {
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setDayStartHour(4);

    const stamps = JSON.parse(localStorage.getItem(SETTINGS_EDITED_AT_KEY)!);
    expect(stamps.dayStartHour).toBeGreaterThan(0);
    expect(stamps.saltLimit).toBeUndefined();
  });

  it("adopts a row newer than this device's last edit", async () => {
    localStorage.setItem(SETTINGS_EDITED_AT_KEY, JSON.stringify({ saltLimit: Date.now() - 60_000 }));
    useSettingsStore.setState({ saltLimit: 1900 });
    await db.userSettings.put(remoteRow({ saltLimit: 2300, updatedAt: Date.now() }));

    dispose = installSettingsSync();
    await settle();

    expect(useSettingsStore.getState().saltLimit).toBe(2300);
  });

  it("syncs the week start like the day start hour", async () => {
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setWeekStartsOn(0);
    await settle();

    const row = (await getActiveUserSettings())!;
    expect(row.weekStartsOn).toBe(0);
    expect(row.fieldUpdatedAt!.weekStartsOn).toBe(row.updatedAt);
    const stamps = JSON.parse(localStorage.getItem(SETTINGS_EDITED_AT_KEY)!);
    expect(stamps.weekStartsOn).toBeGreaterThan(0);
  });

  it("applies a week start chosen on another device", async () => {
    dispose = installSettingsSync();
    await settle();

    await db.userSettings.put(remoteRow({ weekStartsOn: 6 }));
    await settle();

    expect(useSettingsStore.getState().weekStartsOn).toBe(6);
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("does not let an untouched week start outrank another device's choice", async () => {
    // A row written before the setting existed; this device never chose a
    // week start, so writing its default must not count as a new edit.
    const earlier = Date.now() - 60_000;
    const { weekStartsOn: _drop, ...legacy } = remoteRow({ updatedAt: earlier });
    void _drop;
    await db.userSettings.put(legacy as UserSettings);
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setWaterLimit(1500);
    await settle();

    const row = (await getActiveUserSettings())!;
    expect(row.weekStartsOn).toBe(1);
    expect(row.fieldUpdatedAt!.waterLimit).toBe(row.updatedAt);
    expect(row.fieldUpdatedAt!.weekStartsOn).toBe(SEED_UPDATED_AT);
  });

  it("stamps a week start chosen on this device over a row without one", async () => {
    const { weekStartsOn: _drop, ...legacy } = remoteRow({ updatedAt: Date.now() - 60_000 });
    void _drop;
    await db.userSettings.put(legacy as UserSettings);
    dispose = installSettingsSync();
    await settle();

    useSettingsStore.getState().setWeekStartsOn(0);
    await settle();

    const row = (await getActiveUserSettings())!;
    expect(row.weekStartsOn).toBe(0);
    expect(row.fieldUpdatedAt!.weekStartsOn).toBe(row.updatedAt);
  });

  it("writes a week start chosen last session over a row without one", async () => {
    // The app closed after this device picked Sunday but before the table
    // write; the row still predates the setting.
    const now = Date.now();
    const { weekStartsOn: _drop, ...legacy } = remoteRow({ updatedAt: now - 120_000 });
    void _drop;
    await db.userSettings.put(legacy as UserSettings);
    useSettingsStore.setState({ weekStartsOn: 0 });
    localStorage.setItem(SETTINGS_EDITED_AT_KEY, JSON.stringify({ weekStartsOn: now - 60_000 }));

    dispose = installSettingsSync();
    await settle();

    const row = (await getActiveUserSettings())!;
    expect(row.weekStartsOn).toBe(0);
    expect(row.fieldUpdatedAt!.weekStartsOn).toBeGreaterThan(SEED_UPDATED_AT);
    expect(useSettingsStore.getState().weekStartsOn).toBe(0);
  });

  it("keeps the local week start for a row without one or with a malformed one", async () => {
    useSettingsStore.setState({ weekStartsOn: 0 });
    const { weekStartsOn: _drop, ...legacy } = remoteRow({ saltLimit: 2100 });
    void _drop;
    await db.userSettings.put(legacy as UserSettings);

    dispose = installSettingsSync();
    await settle();
    expect(useSettingsStore.getState().saltLimit).toBe(2100);
    expect(useSettingsStore.getState().weekStartsOn).toBe(0);

    await db.userSettings.put(remoteRow({ weekStartsOn: 9, updatedAt: Date.now() + 1_000 }));
    await settle();
    expect(useSettingsStore.getState().weekStartsOn).toBe(0);
  });

  describe("while a manual preview's sample database is swapped in", () => {
    it("writes an edit to the real row once the real database is back, never to the preview", async () => {
      dispose = installSettingsSync();
      await settle();
      useSettingsStore.getState().setWaterLimit(1500);
      await settle();

      const preview = createPreviewDatabase();
      await preview.open();
      setActiveDatabase(preview);
      try {
        useSettingsStore.getState().setWaterLimit(1700);
        await settle();
        expect(await preview.userSettings.count()).toBe(0);
        expect(await preview._syncQueue.count()).toBe(0);

        resetActiveDatabase();
        await settle();
        const rows = await db.userSettings.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0]!.waterLimit).toBe(1700);
      } finally {
        resetActiveDatabase();
        await preview.delete();
      }
    });

    it("does not seed a row into the preview when the app starts with a guide open", async () => {
      useSettingsStore.setState({ saltLimit: 1800 });
      const preview = createPreviewDatabase();
      await preview.open();
      setActiveDatabase(preview);
      try {
        dispose = installSettingsSync();
        await settle();
        expect(await preview.userSettings.count()).toBe(0);

        resetActiveDatabase();
        await settle();
        const rows = await db.userSettings.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0]!.saltLimit).toBe(1800);
      } finally {
        resetActiveDatabase();
        await preview.delete();
      }
    });
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
      completePull();
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
      completePull();
      await settle();

      expect(useSettingsStore.getState().saltLimit).toBe(2400);
      const backup = JSON.parse(localStorage.getItem(PRE_SYNC_SETTINGS_BACKUP_KEY)!);
      expect(backup.settings.saltLimit).toBe(1800);
    });

    it("seeds from local settings when the cloud has no settings row yet", async () => {
      useSettingsStore.setState({ saltLimit: 1800 });
      dispose = installSettingsSync();
      await settle();

      completePull();
      await settle();

      const row = await getActiveUserSettings();
      expect(row!.saltLimit).toBe(1800);
      expect(row!.updatedAt).toBe(SEED_UPDATED_AT);
    });

    it("keeps only the keys edited here before the pull, not every differing value", async () => {
      // This device's stale limit, and a home zone recorded before the pull
      // (the timezone check runs at startup).
      useSettingsStore.setState({ saltLimit: 1800 });
      dispose = installSettingsSync();
      await settle();
      useSettingsStore.getState().setHomeTimezone("Africa/Johannesburg");
      await settle();

      await db.userSettings.put(remoteRow({ saltLimit: 2400, updatedAt: Date.now() - 60_000 }));
      completePull();
      await settle();

      const state = useSettingsStore.getState();
      expect(state.saltLimit).toBe(2400);
      expect(state.homeTimezone).toBe("Africa/Johannesburg");
      const row = await getActiveUserSettings();
      expect(row!.saltLimit).toBe(2400);
      expect(row!.homeTimezone).toBe("Africa/Johannesburg");
    });

    it("keeps only the keys whose earlier-session edit stamps are newer than the row", async () => {
      useSettingsStore.setState({ saltLimit: 1800, dayStartHour: 5 });
      localStorage.setItem(
        SETTINGS_EDITED_AT_KEY,
        JSON.stringify({ dayStartHour: Date.now() - 1_000, saltLimit: Date.now() - 600_000 }),
      );
      await db.userSettings.put(
        remoteRow({ saltLimit: 2400, dayStartHour: 3, updatedAt: Date.now() - 60_000 }),
      );
      useSyncStatusStore.setState({
        initialSyncComplete: true,
        lastPulledAt: Date.now() - 86_400_000,
      });

      dispose = installSettingsSync();
      await settle();

      const state = useSettingsStore.getState();
      expect(state.dayStartHour).toBe(5);
      expect(state.saltLimit).toBe(2400);
      expect((await getActiveUserSettings())!.dayStartHour).toBe(5);
    });

    it("an upgraded device (initial sync done long ago) waits for a pull before seeding", async () => {
      // Parity flag persisted from before the userSettings table existed:
      // the cloud's settings row has never been pulled here.
      useSyncStatusStore.setState({
        initialSyncComplete: true,
        lastPulledAt: Date.now() - 86_400_000,
      });
      useSettingsStore.setState({ saltLimit: 1800 });
      dispose = installSettingsSync();
      await settle();
      expect(await db.userSettings.count()).toBe(0);

      // The first pull after the upgrade brings the other device's row.
      await db.userSettings.put(remoteRow({ saltLimit: 2400 }));
      completePull();
      await settle();

      expect(useSettingsStore.getState().saltLimit).toBe(2400);
      const backup = JSON.parse(localStorage.getItem(PRE_SYNC_SETTINGS_BACKUP_KEY)!);
      expect(backup.settings.saltLimit).toBe(1800);
    });

    it("keeps a copy of this device's seeded values when another device's seed replaces it", async () => {
      useSettingsStore.setState({ saltLimit: 1800 });
      dispose = installSettingsSync();
      await settle();
      completePull();
      await settle();
      expect((await getActiveUserSettings())!.updatedAt).toBe(SEED_UPDATED_AT);

      // Both devices seeded at once; the server kept the other one, and the
      // pull overwrites ours (same id, same SEED_UPDATED_AT).
      await db.userSettings.put(
        remoteRow({ saltLimit: 2400, updatedAt: SEED_UPDATED_AT, createdAt: SEED_UPDATED_AT }),
      );
      await settle();

      expect(useSettingsStore.getState().saltLimit).toBe(2400);
      const backup = JSON.parse(localStorage.getItem(PRE_SYNC_SETTINGS_BACKUP_KEY)!);
      expect(backup.settings.saltLimit).toBe(1800);
    });
  });
});
