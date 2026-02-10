import type { GraphScope } from "@/hooks/use-graph-data";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const COLORS = {
  water: "hsl(199 89% 48%)",
  salt: "hsl(38 92% 50%)",
  weight: "hsl(160 84% 39%)",
  eating: "hsl(25 95% 53%)",
  urination: "hsl(263 70% 50%)",
  // BP color matrix
  systolic: "hsl(346 77% 50%)",
  diastolicColor: "hsl(330 65% 55%)",
  heartRate: "hsl(15 80% 50%)",
  // lighter variants for standing
  systolicLight: "hsl(346 77% 65%)",
  diastolicLight: "hsl(330 65% 70%)",
  heartRateLight: "hsl(15 80% 65%)",
} as const;

export const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

/** Shared left/right/top/bottom margins for all charts */
export const CHART_MARGIN = { top: 10, right: 10, left: -20, bottom: 0 };

export function formatTimeLabel(ts: number, scope: GraphScope): string {
  const d = new Date(ts);
  if (scope === "24h") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
