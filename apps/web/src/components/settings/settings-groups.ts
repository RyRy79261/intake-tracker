import type { CSSProperties } from "react";
import {
  Activity,
  BookOpen,
  Bug,
  Database,
  Download,
  Info,
  MessageSquare,
  Palette,
  Pill,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { SettingsGroupId } from "@/stores/settings-sheet-store";

/**
 * The colour of a settings group. Most are domain colours; `steel` is a
 * settings-only token and `muted` is the neutral text grey. All are defined
 * per theme in `packages/ui/src/styles/globals.css`.
 */
export type SettingsColor =
  | "water"
  | "sugar"
  | "meds"
  | "ai"
  | "sodium"
  | "weight"
  | "steel"
  | "alcohol"
  | "bp"
  | "caffeine"
  | "muted";

/** The CSS custom property (HSL channels) behind each settings colour. */
const SETTINGS_COLOR_TOKEN: Record<SettingsColor, string> = {
  water: "--water",
  sugar: "--sugar",
  meds: "--meds",
  ai: "--ai",
  sodium: "--sodium",
  weight: "--weight",
  steel: "--steel",
  alcohol: "--alcohol",
  bp: "--bp",
  caffeine: "--caffeine",
  muted: "--muted-fg",
};

export interface SettingsGroupMeta {
  id: SettingsGroupId;
  title: string;
  icon: LucideIcon;
  color: SettingsColor;
}

/**
 * The settings groups, in the prototype's order, each with its own icon and
 * colour. Neighbouring groups never share a colour (settings-groups.test.ts).
 * The retired swipe-navigation, quick-nav and animation-timing sections keep
 * their (synced) store keys.
 */
export const SETTINGS_GROUP_META: ReadonlyArray<SettingsGroupMeta> = [
  { id: "tracking", title: "Tracking", icon: Activity, color: "water" },
  { id: "appearance", title: "Appearance", icon: Palette, color: "sugar" },
  { id: "meds", title: "Medications", icon: Pill, color: "meds" },
  { id: "ai", title: "AI features", icon: Sparkles, color: "ai" },
  { id: "data", title: "Data & storage", icon: Database, color: "sodium" },
  { id: "privacy", title: "Privacy", icon: Shield, color: "weight" },
  { id: "system", title: "System", icon: Download, color: "steel" },
  { id: "help", title: "Help & Manual", icon: BookOpen, color: "alcohol" },
  { id: "feedback", title: "Feedback", icon: MessageSquare, color: "bp" },
  { id: "about", title: "About", icon: Info, color: "muted" },
  { id: "debug", title: "Debug", icon: Bug, color: "caffeine" },
];

/** A usable CSS colour, e.g. `hsl(var(--water))`. */
export function settingsColor(color: SettingsColor): string {
  return `hsl(var(${SETTINGS_COLOR_TOKEN[color]}))`;
}

/**
 * Inline style that tints everything inside a settings group:
 *
 * - `--g` is the group colour (header icon, stripe, sub-headings).
 * - `--primary`, `--primary-foreground` and `--ring` are re-pointed at it, so
 *   the group's primary buttons, switch on-state, selected segment and focus
 *   rings take the colour with no per-control classes. Dialogs and popovers
 *   render in a portal, outside the group, and keep the ink primary.
 *
 * `muted` only sets `--g`: a grey primary button would read as disabled.
 */
export function settingsGroupStyle(color: SettingsColor): CSSProperties {
  const token = SETTINGS_COLOR_TOKEN[color];
  const style: Record<string, string> = { "--g": `hsl(var(${token}))` };
  if (color !== "muted") {
    style["--primary"] = `var(${token})`;
    style["--primary-foreground"] = "var(--onD)";
    style["--ring"] = `var(${token})`;
  }
  return style as CSSProperties;
}
