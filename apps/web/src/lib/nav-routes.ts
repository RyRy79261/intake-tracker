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
  // The Records tab of Metrics. Not /history: that route is only a redirect
  // outside the chrome, so the bars would flicker and History never light up.
  history: { id: "history", title: "History", icon: "history", color: null, size: "M", path: "/analytics?tab=records" },
  profile: { id: "profile", title: "Profile", icon: "profile", color: null, size: "M", path: "/profile" },
  help: { id: "help", title: "User Manual", icon: "book", color: null, size: "M", path: "/help" },
};

/** Apps with their own sys-bar button, in order (Profile is the avatar). */
export const SYS_BAR_APPS = ["meds", "metrics", "history"] as const satisfies readonly ShellAppId[];

/**
 * Whether the app's route is the current page. An app whose path carries a
 * query (History: `/analytics?tab=records`) is on only when that query
 * matches; an app on the same pathname without one (Metrics) is on otherwise.
 */
export function isShellAppOn(
  id: ShellAppId,
  pathname: string | null,
  searchParams: { get(name: string): string | null } | null,
): boolean {
  const matches = (path: string) => {
    const [base, query] = path.split("?");
    if (base !== pathname) return false;
    if (!query) return true;
    return [...new URLSearchParams(query)].every(([k, v]) => searchParams?.get(k) === v);
  };
  const path = SHELL_APPS[id].path;
  if (!matches(path)) return false;
  if (path.includes("?")) return true;
  // A query-specific sibling on the same pathname takes precedence.
  return !Object.values(SHELL_APPS).some((a) => a.path.includes("?") && matches(a.path));
}
