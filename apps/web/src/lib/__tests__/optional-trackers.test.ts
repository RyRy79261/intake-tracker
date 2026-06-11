// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  OPTIONAL_TRACKERS,
  OPTIONAL_TRACKER_DEFAULTS,
  useOptionalTrackerEnabled,
  getOptionalTrackerEnabled,
  type OptionalTrackerKey,
} from "@/lib/optional-trackers";
import { useSettingsStore } from "@/stores/settings-store";

describe("OPTIONAL_TRACKERS registry", () => {
  it("contains exactly the documented trackers (sugar, potassium)", () => {
    const keys = OPTIONAL_TRACKERS.map((t) => t.key).sort();
    expect(keys).toEqual(["potassium", "sugar"]);
  });

  it("every entry has a label, description, icon, color class, and unit", () => {
    for (const tracker of OPTIONAL_TRACKERS) {
      expect(tracker.label).toMatch(/.+/);
      expect(tracker.description.length).toBeGreaterThan(10);
      expect(tracker.icon).toBeTypeOf("object"); // forwardRef'd component
      expect(tracker.iconColorClass).toMatch(/text-/);
      expect(tracker.unit).toMatch(/^(g|mg)$/);
    }
  });

  it("registry keys match the typed OptionalTrackerKey union", () => {
    // Trivially true at compile time; this just guards against silent
    // expansions of the registry without an accompanying type update.
    const knownKeys: OptionalTrackerKey[] = ["sugar", "potassium"];
    for (const tracker of OPTIONAL_TRACKERS) {
      expect(knownKeys).toContain(tracker.key);
    }
  });

  it("defaults map mirrors the registry and the store defaults", () => {
    expect(OPTIONAL_TRACKER_DEFAULTS.sugar).toBe(true);
    expect(OPTIONAL_TRACKER_DEFAULTS.potassium).toBe(false);
    for (const tracker of OPTIONAL_TRACKERS) {
      expect(OPTIONAL_TRACKER_DEFAULTS).toHaveProperty(tracker.key);
    }
  });
});

describe("useOptionalTrackerEnabled / getOptionalTrackerEnabled", () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it("reads the current enabled flag for a given tracker", () => {
    const { result: sugarResult } = renderHook(() =>
      useOptionalTrackerEnabled("sugar"),
    );
    expect(sugarResult.current).toBe(true);

    const { result: potResult } = renderHook(() =>
      useOptionalTrackerEnabled("potassium"),
    );
    expect(potResult.current).toBe(false);
  });

  it("re-renders when the underlying setting changes", () => {
    const { result } = renderHook(() => useOptionalTrackerEnabled("potassium"));
    expect(result.current).toBe(false);
    act(() => {
      useSettingsStore.getState().setOptionalTracker("potassium", true);
    });
    expect(result.current).toBe(true);
  });

  it("non-reactive getter agrees with the hook", () => {
    expect(getOptionalTrackerEnabled("sugar")).toBe(true);
    expect(getOptionalTrackerEnabled("potassium")).toBe(false);
    useSettingsStore.getState().setOptionalTracker("sugar", false);
    expect(getOptionalTrackerEnabled("sugar")).toBe(false);
  });
});
