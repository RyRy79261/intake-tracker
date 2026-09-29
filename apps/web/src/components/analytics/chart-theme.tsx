/**
 * Recharts theme for the Metrics window, all through the Ward CSS variables
 * so the charts follow day/night with no JS: Plex Mono ticks, a dashed
 * muted grid, square dots, square bars and a sharp-bordered tooltip.
 * Series colours are the domain colours.
 */
import type { CSSProperties } from "react";

const MONO = "var(--font-plex-mono), ui-monospace, Menlo, Consolas, monospace";

/** Chart series colours, one per domain. */
export const CHART_COLOR = {
  water: "hsl(var(--water))",
  bp: "hsl(var(--bp))",
  /** Diastolic: the BP colour shifted towards sugar, as in the prototype. */
  diastolic: "color-mix(in srgb, hsl(var(--bp)) 55%, hsl(var(--sugar)))",
  weight: "hsl(var(--weight))",
  line: "hsl(var(--line))",
  muted: "hsl(var(--muted-fg))",
} as const;

/** Axis tick text: 10px Plex Mono in the muted ink. */
export const AXIS_TICK = { fontSize: 10, fontFamily: MONO, fill: CHART_COLOR.muted };

/** Shared axis props: no tick marks, a 1px line-coloured axis. */
export const AXIS_PROPS = {
  tick: AXIS_TICK,
  tickLine: false,
  axisLine: { stroke: CHART_COLOR.line },
  // Recharts measures labels in the default face; leave room for the mono one.
  minTickGap: 14,
} as const;

/** Round a Y domain out to whole `step`s past a `pad`, so the ticks land on round numbers. */
export function roundDomain(pad: number, step: number): [(min: number) => number, (max: number) => number] {
  return [
    (min) => Math.floor((min - pad) / step) * step,
    (max) => Math.ceil((max + pad) / step) * step,
  ];
}

/** Horizontal dashed grid at low opacity, like the prototype's `gridY`. */
export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: CHART_COLOR.muted,
  strokeOpacity: 0.3,
  vertical: false,
} as const;

const TOOLTIP_CONTENT: CSSProperties = {
  backgroundColor: "hsl(var(--panel))",
  border: "1px solid hsl(var(--line))",
  borderRadius: 0,
  boxShadow: "none",
  padding: "4px 8px",
  fontFamily: MONO,
  fontSize: 11,
  lineHeight: 1.35,
  color: "hsl(var(--fg))",
};

/** Tooltip props: sharp border, Plex Mono, a thin muted cursor. */
export const TOOLTIP_PROPS = {
  contentStyle: TOOLTIP_CONTENT,
  labelStyle: { color: CHART_COLOR.muted, marginBottom: 2 },
  itemStyle: { padding: 0 },
  cursor: { stroke: CHART_COLOR.muted, strokeWidth: 1, fill: "hsl(var(--fg) / 0.05)" },
} as const;

interface DotProps {
  cx?: number | undefined;
  cy?: number | undefined;
  stroke?: string | undefined;
  index?: number | undefined;
}

/** A 6px square data point (Recharts' `dot`/`activeDot` render prop). */
export function squareDot(size = 6) {
  function SquareDot({ cx, cy, stroke, index }: DotProps) {
    if (cx == null || cy == null || Number.isNaN(cx) || Number.isNaN(cy)) {
      return <g key={`d${index}`} />;
    }
    return (
      <rect
        key={`d${index}`}
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        fill={stroke}
      />
    );
  }
  return SquareDot;
}
