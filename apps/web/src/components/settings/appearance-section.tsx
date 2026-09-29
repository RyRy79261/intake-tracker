"use client";

import { useTheme } from "next-themes";
import { useSettingsStore } from "@/stores/settings-store";
import { Seg, Tog, flabelClass } from "@/components/settings/settings-kit";

const THEMES = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "System"],
] as const;

type ThemeChoice = (typeof THEMES)[number][0];

function isThemeChoice(value: string | undefined): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Settings › Appearance: theme (next-themes), Bigger text and Reduce
 * motion. The last two are device-only and applied by DisplayPrefs.
 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const bigText = useSettingsStore((s) => s.bigText);
  const setBigText = useSettingsStore((s) => s.setBigText);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setReduceMotion = useSettingsStore((s) => s.setReduceMotion);

  return (
    <>
      <div>
        <span className={flabelClass}>Theme</span>
        <Seg label="Theme" value={isThemeChoice(theme) ? theme : "system"} options={THEMES} onChange={setTheme} />
      </div>
      <Tog
        id="set-big-text"
        label="Bigger text"
        description="Larger type and controls across the app."
        checked={bigText}
        onCheckedChange={setBigText}
      />
      <Tog
        id="set-reduce-motion"
        label="Reduce motion"
        description="Turns off animations and sliding transitions."
        checked={reduceMotion}
        onCheckedChange={setReduceMotion}
      />
    </>
  );
}
