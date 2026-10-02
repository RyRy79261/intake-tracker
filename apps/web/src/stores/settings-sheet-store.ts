import { create } from "zustand";

/**
 * The global Settings sheet (Ward Console): whether it is open, which page
 * it shows, and which groups are expanded. Not persisted; the groups stay
 * as the user left them while the app is open.
 *
 * Open and close it with `openSettings` / `closeSettings` from
 * hooks/use-window-history.ts, which also give it a Back entry.
 */

export const SETTINGS_GROUPS = [
  "tracking",
  "appearance",
  "meds",
  "ai",
  "data",
  "privacy",
  "system",
  "help",
  "feedback",
  "about",
  "debug",
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number];

/** `main` = the groups; `presets` = the Drink presets sub-page. */
export type SettingsPage = "main" | "presets";

export function isSettingsGroup(value: unknown): value is SettingsGroupId {
  return typeof value === "string" && (SETTINGS_GROUPS as readonly string[]).includes(value);
}

interface SettingsSheetState {
  open: boolean;
  page: SettingsPage;
  groups: Partial<Record<SettingsGroupId, boolean>>;
  /** Open the sheet on its main page, expanding `group` if given. */
  show: (group?: SettingsGroupId | null) => void;
  hide: () => void;
  setPage: (page: SettingsPage) => void;
  toggleGroup: (group: SettingsGroupId) => void;
}

export const useSettingsSheetStore = create<SettingsSheetState>()((set) => ({
  open: false,
  page: "main",
  // Tracking starts open, as in the prototype.
  groups: { tracking: true },
  show: (group) =>
    set((s) => ({
      open: true,
      page: s.open ? s.page : "main",
      groups: group ? { ...s.groups, [group]: true } : s.groups,
    })),
  hide: () => set({ open: false, page: "main" }),
  setPage: (page) => set({ page }),
  toggleGroup: (group) => set((s) => ({ groups: { ...s.groups, [group]: !s.groups[group] } })),
}));
