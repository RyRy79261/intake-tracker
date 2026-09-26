"use client";

import { useSettingsStore } from "@/stores/settings-store";

export function useSettings() {
  const settings = useSettingsStore();
  return settings;
}
