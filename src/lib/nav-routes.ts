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
