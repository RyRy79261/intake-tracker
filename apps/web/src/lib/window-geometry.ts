import { SHELL_APPS, type ShellAppSize, type WindowAppId } from "@/lib/nav-routes";

/**
 * Window geometry as plain functions, so the clamping, cascade, snap and
 * tiling rules are tested without a browser. Every rect is in the window
 * area's own coordinates (0,0 is its top left corner, under the sys-bar).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Area {
  w: number;
  h: number;
}

/** Which side or corner of a window a resize grip pulls. */
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** A window snapped to the left or right half of the area. */
export type SnapSide = "l" | "r";

/** Where a dragged window would land on release: a half, or maximised. */
export type SnapZone = SnapSide | "max" | null;

/** Default window sizes on wide screens, from the prototype. */
export const WINDOW_SIZES: Record<ShellAppSize, readonly [number, number]> = {
  S: [520, 440],
  M: [720, 520],
  L: [880, 600],
};

/**
 * The smallest a window can be resized to. 360px is the narrowest phone the
 * window bodies are laid out for, so nothing inside is clipped at this size.
 */
export const WINDOW_MIN: Record<WindowAppId, readonly [number, number]> = {
  meds: [360, 400],
  metrics: [360, 400],
  profile: [360, 280],
  help: [360, 280],
};

/** The area assumed until the window layer has been measured. */
export const DEFAULT_AREA: Area = { w: 928, h: 756 };

/** Each new window opens this far down and right of the last one. */
export const CASCADE_STEP = 28;
/** One arrow-key press moves or resizes a window by this much. */
export const KEY_STEP = 16;
/** A drag this close to the left or right edge snaps to that half. */
export const SNAP_EDGE = 8;

const GAP = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** An app's minimum size, never more than the area itself. */
export function minSize(app: WindowAppId, area: Area): { w: number; h: number } {
  const [w, h] = WINDOW_MIN[app];
  return { w: Math.min(w, area.w), h: Math.min(h, area.h) };
}

/**
 * Where a new window opens: its app's default size, `n` cascade steps down
 * and right of the top left corner. It shrinks to fit rather than leaving
 * the area. The prototype's `defaultRect`.
 */
export function defaultRect(app: WindowAppId, area: Area, n = 0): Rect {
  const [sw, sh] = WINDOW_SIZES[SHELL_APPS[app].size];
  const x = Math.min(16 + n * CASCADE_STEP, Math.max(GAP, area.w - 368));
  const y = Math.min(12 + n * CASCADE_STEP, Math.max(GAP, area.h - 268));
  return {
    x,
    y,
    w: Math.max(Math.min(360, area.w - 16), Math.min(sw, area.w - GAP - x)),
    h: Math.min(sh, area.h - GAP - y),
  };
}

/**
 * The default rect on the first cascade step whose corner no open window
 * already sits on, so a new window never hides exactly behind another.
 */
export function cascadeRect(app: WindowAppId, area: Area, taken: readonly Rect[]): Rect {
  let rect = defaultRect(app, area, 0);
  for (let n = 0; n < 12; n++) {
    rect = defaultRect(app, area, n);
    const { x, y } = rect;
    if (!taken.some((t) => t.x === x && t.y === y)) return rect;
  }
  return rect;
}

/** The rect, shrunk and shifted as little as needed to lie inside the area. */
export function fitRect(rect: Rect, area: Area, min: { w: number; h: number }): Rect {
  const w = Math.round(clamp(rect.w, min.w, area.w));
  const h = Math.round(clamp(rect.h, min.h, area.h));
  return {
    x: Math.round(clamp(rect.x, 0, area.w - w)),
    y: Math.round(clamp(rect.y, 0, area.h - h)),
    w,
    h,
  };
}

/** The rect moved to (x, y), kept wholly inside the area. */
export function moveRect(rect: Rect, x: number, y: number, area: Area): Rect {
  return {
    ...rect,
    x: Math.round(clamp(x, 0, area.w - rect.w)),
    y: Math.round(clamp(y, 0, area.h - rect.h)),
  };
}

/**
 * The rect after dragging one edge or corner by (dx, dy): never smaller than
 * `min` (the opposite edge stays put) and never past the area.
 */
export function resizeRect(
  from: Rect,
  edge: Edge,
  dx: number,
  dy: number,
  area: Area,
  min: { w: number; h: number },
): Rect {
  let { x, y, w, h } = from;
  const right = from.x + from.w;
  const bottom = from.y + from.h;
  if (edge.includes("e")) w = clamp(from.w + dx, min.w, area.w - from.x);
  if (edge.includes("s")) h = clamp(from.h + dy, min.h, area.h - from.y);
  if (edge.includes("w")) {
    x = clamp(from.x + dx, 0, right - min.w);
    w = right - x;
  }
  if (edge.includes("n")) {
    y = clamp(from.y + dy, 0, bottom - min.h);
    h = bottom - y;
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** The left or right half of the area. */
export function snapRect(side: SnapSide, area: Area): Rect {
  const half = Math.floor(area.w / 2);
  return side === "l" ? { x: 0, y: 0, w: half, h: area.h } : { x: half, y: 0, w: area.w - half, h: area.h };
}

/**
 * Where a window dragged with the pointer at (px, py) would snap: the left
 * or right half when the pointer reaches that edge, maximised when it
 * reaches the top.
 */
export function snapZone(px: number, py: number, area: Area): SnapZone {
  if (py <= 0) return "max";
  if (px <= SNAP_EDGE) return "l";
  if (px >= area.w - SNAP_EDGE) return "r";
  return null;
}

/**
 * Tiled rects for `n` windows: one at its default size, two or three side
 * by side in columns (on 900px or wider), otherwise a 2×2 or 3×2 grid. The
 * prototype's `tidy` and `tileCols`.
 */
export function tileRects(apps: readonly WindowAppId[], area: Area): Rect[] {
  const n = apps.length;
  if (n === 0) return [];
  if (n === 1) return [defaultRect(apps[0] as WindowAppId, area)];
  if (n <= 3 && area.w >= 900) {
    const cw = Math.floor((area.w - GAP * (n + 1)) / n);
    return apps.map((_, i) => ({ x: GAP + i * (cw + GAP), y: GAP, w: cw, h: area.h - 2 * GAP }));
  }
  const cells: ReadonlyArray<readonly [number, number, number, number]> =
    n <= 4
      ? [
          [0, 0, 0.5, 0.5],
          [0.5, 0, 0.5, 0.5],
          [0, 0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5, 0.5],
        ]
      : [0, 1, 2, 3, 4, 5].map((i) => [(i % 3) / 3, Math.floor(i / 3) / 2, 1 / 3, 0.5] as const);
  return apps.map((_, i) => {
    const [cx, cy, cw, ch] = cells[i] as readonly [number, number, number, number];
    return {
      x: Math.round(GAP + cx * (area.w - GAP)),
      y: Math.round(GAP + cy * (area.h - GAP)),
      w: Math.round(cw * (area.w - GAP) - GAP),
      h: Math.round(ch * (area.h - GAP) - GAP),
    };
  });
}
