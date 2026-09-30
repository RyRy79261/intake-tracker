/** The routes that show the shell's bars: Home, the app deep links and Settings. */
const CHROME_ROUTES: ReadonlySet<string> = new Set(["/profile", "/", "/medications", "/analytics", "/settings"]);

/** Routes that show the Ward Console shell's sys-bar and bottom bar. */
export function isChromeRoute(pathname: string | null): boolean {
  return pathname !== null && CHROME_ROUTES.has(pathname);
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
  | "tidy"
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
 * The apps the Ward Console shell can open. The sys-bar buttons open them as
 * windows; `path` is the route that deep-links to each one.
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

// ---------------------------------------------------------------------------
// Ward Console windows
// ---------------------------------------------------------------------------

/** Apps that open as a window. History is not one: it opens Metrics › Records. */
export type WindowAppId = "meds" | "metrics" | "profile" | "help";

/** Per-window state, e.g. `{ tab: "records" }` for Metrics. */
export type WindowState = Record<string, string | number | boolean | null>;

/** The window an app opens, after mapping History onto Metrics › Records. */
export function resolveWindowApp(
  app: ShellAppId,
  st?: WindowState,
): { app: WindowAppId; st: WindowState } | null {
  // History = Metrics on Records, unfiltered unless the caller filters it.
  if (app === "history") return { app: "metrics", st: { filter: "all", ...st, tab: "records" } };
  if (app === "meds" || app === "metrics" || app === "profile" || app === "help") return { app, st: { ...st } };
  return null;
}

/**
 * Routes that open a window over Home when the shell is on. With the shell
 * off they stay ordinary pages, so deep links, PWA shortcuts and e2e `goto`
 * keep working either way.
 */
const WINDOW_ROUTE_APPS: Readonly<Record<string, ShellAppId>> = {
  "/medications": "meds",
  "/analytics": "metrics",
  "/history": "history",
  "/profile": "profile",
  "/help": "help",
};

/** `/help/<slug>`: the manual window open on one guide. */
const HELP_SLUG_RE = /^\/help\/([^/]+)\/?$/;

export function isWindowRoute(pathname: string | null): boolean {
  return pathname !== null && (Object.hasOwn(WINDOW_ROUTE_APPS, pathname) || HELP_SLUG_RE.test(pathname));
}

/** `/analytics?tab=records` -> the Metrics window on Records. */
export function windowForRoute(
  pathname: string | null,
  search: URLSearchParams | null,
): { app: WindowAppId; st: WindowState } | null {
  if (!isWindowRoute(pathname)) return null;
  const guide = HELP_SLUG_RE.exec(pathname as string);
  if (guide) return { app: "help", st: { slug: safeDecode(guide[1] as string) } };
  if (pathname === "/help") return { app: "help", st: { slug: null } };
  const id = WINDOW_ROUTE_APPS[pathname as string] as ShellAppId;
  const tab = search?.get("tab");
  return resolveWindowApp(id, tab && id === "metrics" ? { tab } : undefined);
}

/** The deep link for a window, so the address bar follows the open window. */
export function windowHref(app: WindowAppId, st?: WindowState): string {
  if (app === "metrics") {
    const tab = typeof st?.tab === "string" ? st.tab : null;
    return tab && tab !== "summary" ? `/analytics?tab=${encodeURIComponent(tab)}` : "/analytics";
  }
  if (app === "help") {
    const slug = typeof st?.slug === "string" && st.slug ? st.slug : null;
    return slug ? `/help/${encodeURIComponent(slug)}` : "/help";
  }
  return app === "meds" ? "/medications" : "/profile";
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
