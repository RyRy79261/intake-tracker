import { describe, it, expect, beforeEach, vi } from "vitest";

let mockSyncAccountId: string | null = null;
vi.mock("@/lib/sync-account", () => ({
  getSyncAccountId: () => mockSyncAccountId,
}));

import { db } from "@/lib/db";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import {
  normalizeConditions,
  saveUserProfile,
  emptyProfile,
  MAX_CONDITIONS,
  MAX_CONDITION_LENGTH,
} from "@/lib/profile-service";

describe("profile-service normalizeConditions", () => {
  it("trims surrounding whitespace from each condition", () => {
    expect(normalizeConditions(["  Hypertension  ", "\tDiabetes\n"])).toEqual([
      "Hypertension",
      "Diabetes",
    ]);
  });

  it("drops blank and whitespace-only entries", () => {
    expect(normalizeConditions(["", "   ", "\t\n", "Asthma"])).toEqual([
      "Asthma",
    ]);
  });

  it("clamps each condition to MAX_CONDITION_LENGTH characters", () => {
    const long = "a".repeat(MAX_CONDITION_LENGTH + 50);
    const [result] = normalizeConditions([long]);
    expect(result).toHaveLength(MAX_CONDITION_LENGTH);
    expect(result).toBe("a".repeat(MAX_CONDITION_LENGTH));
  });

  it("trims BEFORE clamping (leading whitespace does not consume length budget)", () => {
    const value = "   " + "b".repeat(MAX_CONDITION_LENGTH);
    const [result] = normalizeConditions([value]);
    expect(result).toBe("b".repeat(MAX_CONDITION_LENGTH));
  });

  it("dedupes case-insensitively, keeping the first-seen casing", () => {
    expect(
      normalizeConditions(["Hypertension", "HYPERTENSION", "hypertension"]),
    ).toEqual(["Hypertension"]);
  });

  it("treats entries that differ only by surrounding whitespace as duplicates", () => {
    expect(normalizeConditions(["Asthma", "  asthma  "])).toEqual(["Asthma"]);
  });

  it("clamps the total count to MAX_CONDITIONS", () => {
    const many = Array.from({ length: MAX_CONDITIONS + 5 }, (_, i) => `cond-${i}`);
    const result = normalizeConditions(many);
    expect(result).toHaveLength(MAX_CONDITIONS);
    // Keeps the first MAX_CONDITIONS in order.
    expect(result[0]).toBe("cond-0");
    expect(result[MAX_CONDITIONS - 1]).toBe(`cond-${MAX_CONDITIONS - 1}`);
  });

  it("dedupe does not let duplicates consume cap slots", () => {
    // 5 distinct conditions, each repeated 3 times. The cap should be applied
    // to the deduped list, so all 5 distinct values survive.
    const distinct = Array.from({ length: 5 }, (_, i) => `unique-${i}`);
    const withDupes = distinct.flatMap((c) => [c, c, c]);
    expect(normalizeConditions(withDupes)).toEqual(distinct);
  });

  it("returns an empty array for empty input", () => {
    expect(normalizeConditions([])).toEqual([]);
  });

  it("stops at MAX_CONDITIONS even when more distinct values follow", () => {
    const overflow = Array.from(
      { length: MAX_CONDITIONS + 3 },
      (_, i) => `c${i}`,
    );
    const result = normalizeConditions(overflow);
    expect(result).toHaveLength(MAX_CONDITIONS);
    // The values beyond the cap are dropped entirely.
    expect(result).not.toContain(`c${MAX_CONDITIONS}`);
  });
});

describe("profile-service saveUserProfile (audit sync-engine#18)", () => {
  beforeEach(() => {
    mockSyncAccountId = null;
    useSettingsStore.setState({ storageMode: "local" });
    useSyncStatusStore.setState({ initialSyncComplete: false });
  });

  it("gives a new profile the signed-in user's deterministic id", async () => {
    mockSyncAccountId = "user-a";
    useSettingsStore.setState({ storageMode: "cloud-sync" });
    useSyncStatusStore.setState({ initialSyncComplete: true });

    const result = await saveUserProfile({ conditions: ["Hypertension"] });

    expect(result.success).toBe(true);
    const rows = await db.userProfile.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("user-a");
  });

  it("refuses to save in cloud-sync mode before the initial sync completes", async () => {
    mockSyncAccountId = "user-a";
    useSettingsStore.setState({ storageMode: "cloud-sync" });
    useSyncStatusStore.setState({ initialSyncComplete: false });

    const result = await saveUserProfile({ shareConditionsWithAI: true });

    expect(result.success).toBe(false);
    expect(await db.userProfile.count()).toBe(0);
  });

  it("updates an existing profile row in place, keeping its id", async () => {
    mockSyncAccountId = "user-a";
    useSettingsStore.setState({ storageMode: "cloud-sync" });
    useSyncStatusStore.setState({ initialSyncComplete: true });
    await db.userProfile.put({
      ...emptyProfile(),
      id: "legacy-random-id",
      conditions: ["Asthma"],
    });

    const result = await saveUserProfile({ shareConditionsWithAI: true });

    expect(result.success).toBe(true);
    const rows = await db.userProfile.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("legacy-random-id");
    expect(rows[0]!.conditions).toEqual(["Asthma"]);
  });

  it("still saves in local-only mode with no signed-in account", async () => {
    const result = await saveUserProfile({ conditions: ["Gout"] });

    expect(result.success).toBe(true);
    const rows = await db.userProfile.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe("");
  });
});
