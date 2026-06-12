/**
 * Registry of optional, user-toggleable trackers.
 *
 * Optional trackers are nutritional / intake metrics the user can choose to
 * surface (or hide) across the app. Each tracker maps 1:1 to an `IntakeRecord`
 * `type` and has a soft daily target. When disabled, the tracker is hidden
 * from every surface — input forms, voice editors, progress bars, the weekly
 * grid, analytics KPIs and correlations, AI insight snapshots, and history
 * filters — and new entries are NOT persisted (even if the AI returns a
 * value). Previously-recorded data is preserved, just not surfaced.
 *
 * Adding a new optional tracker requires:
 *   1. Add the key to `OptionalTrackerKey` and an entry to `OPTIONAL_TRACKERS`.
 *   2. Add the tracker's `IntakeRecord` `type` to `@intake/types/records`,
 *      `@intake/db/schema`, and a Drizzle migration.
 *   3. Gate every UI / analytics surface on `useOptionalTrackerEnabled(key)`.
 *   4. Seed the default in the settings-store migration.
 */

import { Candy, Banana, type LucideIcon } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";

export type OptionalTrackerKey = "sugar" | "potassium";

export interface OptionalTrackerMeta {
  key: OptionalTrackerKey;
  label: string;
  description: string;
  icon: LucideIcon;
  iconColorClass: string;
  /** Unit shown next to numeric values (e.g. "g", "mg"). */
  unit: string;
}

export const OPTIONAL_TRACKERS: ReadonlyArray<OptionalTrackerMeta> = [
  {
    key: "sugar",
    label: "Sugar",
    description:
      "Log total sugars per food entry. Helpful if you're watching added or hidden sugars.",
    icon: Candy,
    iconColorClass: "text-pink-600 dark:text-pink-400",
    unit: "g",
  },
  {
    key: "potassium",
    label: "Potassium",
    description:
      "Estimate potassium per food entry. Values are rough — many foods aren't labelled for potassium.",
    icon: Banana,
    iconColorClass: "text-purple-600 dark:text-purple-400",
    unit: "mg",
  },
];

/** Default enabled state for each optional tracker (used by the settings
 *  store's defaults and migration). Keep in sync with `OPTIONAL_TRACKERS`. */
export const OPTIONAL_TRACKER_DEFAULTS: Record<OptionalTrackerKey, boolean> = {
  sugar: true,
  potassium: false,
};

/** Reactive hook — returns whether a given optional tracker is currently
 *  enabled. Components should call this near the top of their body and skip
 *  rendering / persisting tracker-specific UI and data when it returns
 *  `false`. */
export function useOptionalTrackerEnabled(key: OptionalTrackerKey): boolean {
  return useSettingsStore((s) => s.optionalTrackers[key]);
}

/** Non-reactive snapshot — for server-side or one-shot reads inside
 *  callbacks where a hook would be inappropriate. */
export function getOptionalTrackerEnabled(key: OptionalTrackerKey): boolean {
  return useSettingsStore.getState().optionalTrackers[key];
}
