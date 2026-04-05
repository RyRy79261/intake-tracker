"use client";

import { useSettingsStore } from "@/stores/settings-store";

export function useSettings() {
  const settings = useSettingsStore();
  return settings;
}

export function useWaterSettings() {
  const increment = useSettingsStore((s) => s.waterIncrement);
  const limit = useSettingsStore((s) => s.waterLimit);
  const setIncrement = useSettingsStore((s) => s.setWaterIncrement);
  const setLimit = useSettingsStore((s) => s.setWaterLimit);

  return { increment, limit, setIncrement, setLimit };
}

export function useSaltSettings() {
  const increment = useSettingsStore((s) => s.saltIncrement);
  const limit = useSettingsStore((s) => s.saltLimit);
  const setIncrement = useSettingsStore((s) => s.setSaltIncrement);
  const setLimit = useSettingsStore((s) => s.setSaltLimit);

  return { increment, limit, setIncrement, setLimit };
}

