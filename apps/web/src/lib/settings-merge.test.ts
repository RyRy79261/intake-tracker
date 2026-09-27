/**
 * Per-setting conflict resolution for the synced settings row. Two devices
 * that edit different settings while offline must both keep their edit;
 * the same setting edited on both resolves to the later edit.
 */
import { describe, expect, it } from "vitest";
import {
  mergeSettingsRows,
  settingStamp,
  stampChangedSettings,
  type SettingsRowLike,
} from "@/lib/settings-merge";

type Row = SettingsRowLike & Record<string, unknown>;

function row(overrides: Record<string, unknown> = {}): Row {
  return {
    id: "user-a",
    waterLimit: 2000,
    saltLimit: 1500,
    dayStartHour: 2,
    optionalTrackers: { sugar: false, potassium: false },
    homeTimezone: null,
    createdAt: 10,
    updatedAt: 100,
    deletedAt: null,
    deviceId: "dev-base",
    fieldUpdatedAt: { waterLimit: 100, saltLimit: 100, dayStartHour: 100, optionalTrackers: 100, homeTimezone: 100 },
    ...overrides,
  } as Row;
}

describe("settingStamp", () => {
  it("reads the per-setting stamp", () => {
    expect(settingStamp(row({ fieldUpdatedAt: { waterLimit: 150 } }), "waterLimit")).toBe(150);
  });

  it("falls back to the row's updatedAt for a row without stamps", () => {
    expect(settingStamp(row({ fieldUpdatedAt: undefined, updatedAt: 90 }), "waterLimit")).toBe(90);
    expect(settingStamp(row({ fieldUpdatedAt: null, updatedAt: 90 }), "saltLimit")).toBe(90);
    expect(settingStamp(row({ fieldUpdatedAt: {}, updatedAt: 90 }), "saltLimit")).toBe(90);
  });
});

describe("mergeSettingsRows", () => {
  // Both devices start from the same row, then edit different settings offline.
  const base = row();
  const deviceA = row({
    waterLimit: 2500,
    updatedAt: 200,
    deviceId: "dev-A",
    fieldUpdatedAt: { ...base.fieldUpdatedAt!, waterLimit: 200 },
  });
  const deviceB = row({
    saltLimit: 1200,
    updatedAt: 180,
    deviceId: "dev-B",
    fieldUpdatedAt: { ...base.fieldUpdatedAt!, saltLimit: 180 },
  });

  it("keeps both devices' edits to different settings, whichever arrives first", () => {
    const aThenB = mergeSettingsRows(mergeSettingsRows(base, deviceA).row, deviceB).row;
    const bThenA = mergeSettingsRows(mergeSettingsRows(base, deviceB).row, deviceA).row;
    for (const merged of [aThenB, bThenA]) {
      expect(merged.waterLimit).toBe(2500);
      expect(merged.saltLimit).toBe(1200);
      expect(merged.fieldUpdatedAt).toMatchObject({ waterLimit: 200, saltLimit: 180 });
      expect(merged.updatedAt).toBe(200);
    }
  });

  it("reports which side each differing setting came from", () => {
    const server = mergeSettingsRows(base, deviceA).row;
    const result = mergeSettingsRows(server, deviceB);
    expect(result.incomingWins).toEqual(["saltLimit"]);
    expect(result.baseWins).toEqual(["waterLimit"]);
  });

  it("resolves the same setting edited on both devices to the later edit", () => {
    const early = row({ waterLimit: 1800, updatedAt: 150, fieldUpdatedAt: { waterLimit: 150 } });
    const late = row({ waterLimit: 3000, updatedAt: 160, fieldUpdatedAt: { waterLimit: 160 } });
    expect(mergeSettingsRows(early, late).row.waterLimit).toBe(3000);
    expect(mergeSettingsRows(late, early).row.waterLimit).toBe(3000);
  });

  it("keeps the base value on a stamp tie", () => {
    const a = row({ waterLimit: 1800 });
    const b = row({ waterLimit: 3000 });
    const result = mergeSettingsRows(a, b);
    expect(result.row.waterLimit).toBe(1800);
    expect(result.incomingWins).toEqual([]);
  });

  it("treats a row without stamps as changed everywhere at its updatedAt", () => {
    // An older client pushes a whole row with no stamps, newer than every
    // stamp on the server: all its values win, as whole-row LWW did.
    const server = row({ waterLimit: 2500, fieldUpdatedAt: { waterLimit: 200 }, updatedAt: 200 });
    const legacy = row({ waterLimit: 2100, saltLimit: 900, fieldUpdatedAt: undefined, updatedAt: 250 });
    const merged = mergeSettingsRows(server, legacy).row;
    expect(merged.waterLimit).toBe(2100);
    expect(merged.saltLimit).toBe(900);

    // Older than a stamped edit: that edit survives.
    const olderLegacy = row({ waterLimit: 2100, fieldUpdatedAt: undefined, updatedAt: 150 });
    expect(mergeSettingsRows(server, olderLegacy).row.waterLimit).toBe(2500);
  });

  it("does not count a reordered object (jsonb key order) or null vs undefined as a change", () => {
    const a = row({ optionalTrackers: { sugar: true, potassium: false }, homeTimezone: null });
    const b = row({
      optionalTrackers: { potassium: false, sugar: true },
      homeTimezone: undefined,
      updatedAt: 500,
      fieldUpdatedAt: { optionalTrackers: 500, homeTimezone: 500 },
    });
    const result = mergeSettingsRows(a, b);
    expect(result.incomingWins).toEqual([]);
    expect(result.baseWins).toEqual([]);
  });

  it("keeps the base value for a setting the incoming row does not carry", () => {
    const withRegion = row({ primaryRegion: "ZA", fieldUpdatedAt: { primaryRegion: 100 } });
    const without = row({ updatedAt: 900, fieldUpdatedAt: undefined });
    delete (without as Record<string, unknown>).primaryRegion;
    expect(mergeSettingsRows(withRegion, without).row.primaryRegion).toBe("ZA");
  });

  it("never merges metadata or server-only columns as settings", () => {
    const server = row({ userId: "u1", serverUpdatedAt: 5 });
    const incoming = row({ updatedAt: 300, deviceId: "dev-new", createdAt: 5 });
    const result = mergeSettingsRows(server, incoming);
    expect(result.incomingWins).toEqual([]);
    expect(result.row.deviceId).toBe("dev-new");
    expect(result.row.createdAt).toBe(5);
    expect(result.row.id).toBe("user-a");
  });
});

describe("stampChangedSettings", () => {
  it("stamps the settings that changed at `at` and keeps the others' stamps", () => {
    const previous = row({ fieldUpdatedAt: { waterLimit: 40, saltLimit: 60 }, updatedAt: 100 });
    const stamps = stampChangedSettings(
      previous,
      { waterLimit: 2500, saltLimit: 1500, dayStartHour: 2 },
      700,
    );
    expect(stamps).toEqual({ waterLimit: 700, saltLimit: 60, dayStartHour: 100 });
  });

  it("stamps every setting at `at` when there is no previous row", () => {
    expect(stampChangedSettings(undefined, { waterLimit: 1, saltLimit: 2 }, 5)).toEqual({
      waterLimit: 5,
      saltLimit: 5,
    });
  });
});
