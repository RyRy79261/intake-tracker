import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads the Ward Console palettes out of the design-system stylesheet, so
 * contrast tests check the colours the app actually ships.
 */

export type Rgb = [number, number, number];

const UI_SRC = path.resolve(__dirname, "../../../../../packages/ui/src");

export const globalsCss = readFileSync(path.join(UI_SRC, "styles/globals.css"), "utf8");

/** Source of a shared primitive, e.g. `uiComponentSource("button")`. */
export function uiComponentSource(name: string): string {
  return readFileSync(path.join(UI_SRC, "components", `${name}.tsx`), "utf8");
}

export const THEMES = [
  ["day", ":root"],
  ["night", ".dark"],
] as const;

export type ThemeSelector = (typeof THEMES)[number][1];

/** The `:root { … }` (day) or `.dark { … }` (night) palette block. */
export function themeBlock(selector: ThemeSelector): string {
  // Anchored to a line start: a comment above also mentions `.dark { … }`.
  const start = globalsCss.indexOf(`\n  ${selector} {`);
  if (start < 0) throw new Error(`no ${selector} palette block`);
  return globalsCss.slice(start, globalsCss.indexOf("}", start));
}

/** Read `--token: H S% L%;` from a palette block as [r, g, b] in 0..1. */
export function rgb(block: string, token: string): Rgb {
  const m = new RegExp(`${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(block);
  if (!m) throw new Error(`${token} is not defined as HSL channels`);
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = (t + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in srgb, a share, b)`. */
export function mix(a: Rgb, b: Rgb, share: number): Rgb {
  return [0, 1, 2].map((i) => (a[i] ?? 0) * share + (b[i] ?? 0) * (1 - share)) as Rgb;
}
