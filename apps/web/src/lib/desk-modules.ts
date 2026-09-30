import { domainColor } from "@/lib/domain-colors";
import type { ShellIconName } from "@/lib/nav-routes";
import type { Area, Rect } from "@/lib/window-geometry";

/**
 * The intake modules of desktop mode: Today and the six logging cards, each
 * in its own free window on the desk. This file is the data about them and
 * the default arrangement; `stores/module-window-store.ts` holds where each
 * one is.
 */

export const MODULE_IDS = ["today", "liquids", "food", "bp", "weight", "wee", "bowel"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && (MODULE_IDS as readonly string[]).includes(value);
}

export interface DeskModule {
  id: ModuleId;
  /** Window title. */
  title: string;
  /** Label under the desk icon of a minimised module. */
  short: string;
  icon: ShellIconName;
  color: string;
  /** Height of the window that shows the whole module without scrolling. */
  natural: number;
  /** The least height at which the module's main action still shows. */
  comfy: number;
}

const FG = "hsl(var(--fg))";

export const DESK_MODULES: Record<ModuleId, DeskModule> = {
  today: { id: "today", title: "Today", short: "Today", icon: "today", color: FG, natural: 376, comfy: 330 },
  liquids: {
    id: "liquids",
    title: "Liquids",
    short: "Liquids",
    icon: "drop",
    color: domainColor("water"),
    natural: 428,
    comfy: 396,
  },
  food: { id: "food", title: "Food", short: "Food", icon: "food", color: domainColor("sodium"), natural: 760, comfy: 320 },
  bp: {
    id: "bp",
    title: "Blood Pressure",
    short: "BP",
    icon: "bp",
    color: domainColor("bp"),
    natural: 384,
    comfy: 320,
  },
  weight: {
    id: "weight",
    title: "Weight",
    short: "Weight",
    icon: "weight",
    color: domainColor("weight"),
    natural: 336,
    comfy: 270,
  },
  wee: {
    id: "wee",
    title: "Urination",
    short: "Urine",
    icon: "wee",
    color: domainColor("bath"),
    natural: 226,
    comfy: 226,
  },
  bowel: {
    id: "bowel",
    title: "Defecation",
    short: "Bowel",
    icon: "bowel",
    color: domainColor("bath"),
    natural: 226,
    comfy: 226,
  },
};

/** The smallest a module window can be: a narrow phone's width. */
export const MODULE_MIN = { w: 340, h: 150 } as const;

/** Today with its narrow (phone) layout, used when it has one column. */
const TODAY_NARROW = { natural: 330, comfy: 270 };

const GAP = 8;
/** A column is never wider than this; wider screens leave the rest free. */
const COLUMN_MAX = 560;

interface Sized {
  id: ModuleId;
  natural: number;
  comfy: number;
}

const sized = (id: ModuleId, narrowToday = false): Sized =>
  id === "today" && narrowToday ? { id, ...TODAY_NARROW } : { id, natural: DESK_MODULES[id].natural, comfy: DESK_MODULES[id].comfy };

/**
 * Heights for windows stacked in one column of `avail` pixels (gaps already
 * taken off). Each gets its natural height when they all fit. Otherwise they
 * give up height in proportion to what they can spare: first down to the
 * height that still shows the main action, then down to the minimum.
 */
export function fitStack(items: readonly Sized[], avail: number): number[] {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const natural = items.map((i) => i.natural);
  if (sum(natural) <= avail) return natural;
  const shrink = (from: number[], to: number[]): number[] => {
    const slack = from.map((f, i) => f - (to[i] as number));
    const total = sum(slack);
    const excess = sum(from) - avail;
    return from.map((f, i) => Math.floor(f - (total > 0 ? (excess * (slack[i] as number)) / total : 0)));
  };
  const comfy = items.map((i) => Math.min(i.comfy, i.natural));
  if (sum(comfy) <= avail) return shrink(natural, comfy);
  const hard = items.map(() => MODULE_MIN.h);
  if (sum(hard) <= avail) return shrink(comfy, hard);
  return hard;
}

/** How many columns of modules fit across the area (2 to 4). */
export function moduleColumns(area: Area): number {
  return Math.min(4, Math.max(2, Math.floor((area.w - GAP) / (MODULE_MIN.w + GAP))));
}

/**
 * The default arrangement: every module open, side by side with 8px gutters
 * and no overlap, as a masonry that fits the area. With four columns Today
 * is two columns wide at the top left; with fewer it takes one column. A
 * column that would be taller than the area gives its windows less height
 * (they scroll) rather than letting them overlap.
 */
export function arrangeModules(area: Area): Record<ModuleId, Rect> {
  const n = moduleColumns(area);
  const colW = Math.min(COLUMN_MAX, Math.floor((area.w - GAP * (n + 1)) / n));
  const colX = (c: number) => GAP + c * (colW + GAP);
  const height = area.h - 2 * GAP;
  const rects = {} as Record<ModuleId, Rect>;

  /** Stack `ids` in column `c` from `top`, in what is left of the height. */
  const stack = (c: number, ids: readonly ModuleId[], top: number, narrowToday = false) => {
    const items = ids.map((id) => sized(id, narrowToday));
    const avail = GAP + height - top - GAP * (ids.length - 1);
    const hs = fitStack(items, avail);
    let y = top;
    ids.forEach((id, i) => {
      rects[id] = { x: colX(c), y, w: colW, h: hs[i] as number };
      y += (hs[i] as number) + GAP;
    });
  };

  if (n >= 4) {
    // Today across the first two columns; its height is settled together
    // with the taller of the two windows under it.
    const [todayH] = fitStack([sized("today"), sized("bp")], height - GAP) as [number, number];
    rects.today = { x: colX(0), y: GAP, w: colW * 2 + GAP, h: todayH };
    const under = GAP + todayH + GAP;
    stack(0, ["bp"], under);
    stack(1, ["weight"], under);
    stack(2, ["liquids", "bowel"], GAP);
    stack(3, ["food", "wee"], GAP);
  } else if (n === 3) {
    stack(0, ["today", "bp"], GAP, true);
    stack(1, ["liquids", "weight", "wee"], GAP);
    stack(2, ["food", "bowel"], GAP);
  } else {
    stack(0, ["today", "liquids", "bp"], GAP, true);
    stack(1, ["food", "weight", "wee", "bowel"], GAP);
  }
  return rects;
}
