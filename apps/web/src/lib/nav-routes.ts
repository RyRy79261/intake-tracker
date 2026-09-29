import { Droplets, Pill, BarChart3, Settings, CircleUser, type LucideIcon } from "lucide-react";

export interface NavRoute {
  path: string;
  icon: LucideIcon;
  label: string;
  title: string;
  subtitle: string;
}

export const NAV_ROUTES = [
  { path: "/profile", icon: CircleUser, label: "Profile", title: "Profile", subtitle: "Account & medical context" },
  { path: "/", icon: Droplets, label: "Intake", title: "Intake Tracker", subtitle: "Daily budget tracking" },
  { path: "/medications", icon: Pill, label: "Meds", title: "Medications", subtitle: "Medicine schedule & tracking" },
  { path: "/analytics", icon: BarChart3, label: "Analytics", title: "Analytics", subtitle: "Insights & record browsing" },
  { path: "/settings", icon: Settings, label: "Settings", title: "Settings", subtitle: "Configure preferences" },
] as const satisfies readonly NavRoute[];

/** Routes that show the app chrome (legacy header or the Ward Console shell). */
export function isChromeRoute(pathname: string | null): boolean {
  return NAV_ROUTES.some((r) => r.path === pathname);
}

// ---------------------------------------------------------------------------
// Ward Console app registry
// ---------------------------------------------------------------------------

/** Icons drawn by components/shell/shell-icon.tsx (24 grid, 1.5 stroke). */
export type ShellIconName =
  | "pill"
  | "metrics"
  | "history"
  | "profile"
  | "gear"
  | "home"
  | "windows"
  | "mic"
  | "plus"
  | "drop"
  | "cup"
  | "food"
  | "bp"
  | "weight"
  | "wee"
  | "bowel"
  | "back"
  | "book";

export type ShellAppId = "meds" | "metrics" | "history" | "profile" | "help";

/** Default window size on wide screens (read by the window manager, PR 3). */
export type ShellAppSize = "S" | "M" | "L";

export interface ShellApp {
  id: ShellAppId;
  title: string;
  icon: ShellIconName;
  /**
   * Domain colour for the app's icon and active rule, as a CSS colour
   * (`var(--color-meds)`), or null for the foreground colour.
   */
  color: string | null;
  size: ShellAppSize;
  /** The route that deep-links to the app. */
  path: string;
}

/**
 * The apps the Ward Console shell can open. Until the window manager lands
 * (PR 3), the sys-bar buttons navigate to `path`.
 */
export const SHELL_APPS: Record<ShellAppId, ShellApp> = {
  meds: { id: "meds", title: "Medications", icon: "pill", color: "var(--color-meds)", size: "M", path: "/medications" },
  metrics: { id: "metrics", title: "Metrics", icon: "metrics", color: null, size: "L", path: "/analytics" },
  history: { id: "history", title: "History", icon: "history", color: null, size: "M", path: "/history" },
  profile: { id: "profile", title: "Profile", icon: "profile", color: null, size: "M", path: "/profile" },
  help: { id: "help", title: "User Manual", icon: "book", color: null, size: "M", path: "/help" },
};

/** Apps with their own sys-bar button, in order (Profile is the avatar). */
export const SYS_BAR_APPS = ["meds", "metrics", "history"] as const satisfies readonly ShellAppId[];
