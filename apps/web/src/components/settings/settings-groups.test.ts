import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SETTINGS_GROUP_META,
  settingsColor,
  settingsGroupStyle,
  type SettingsColor,
} from "@/components/settings/settings-groups";
import { SETTINGS_GROUPS } from "@/stores/settings-sheet-store";

const css = readFileSync(
  path.resolve(__dirname, "../../../../../packages/ui/src/styles/globals.css"),
  "utf8",
);

/** The `:root { … }` (day) or `.dark { … }` (night) palette block. */
function themeBlock(selector: ":root" | ".dark"): string {
  // Anchored to a line start: a comment above also mentions `.dark { … }`.
  const start = css.indexOf(`\n  ${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

/** Read `--token: H S% L%;` from a palette block as [r, g, b] in 0..1. */
function rgb(block: string, token: string): [number, number, number] {
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

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `hsl(var(--water))` → `--water`. */
function tokenOf(color: SettingsColor): string {
  const m = /var\((--[a-z-]+)\)/i.exec(settingsColor(color));
  if (!m?.[1]) throw new Error(`no token for ${color}`);
  return m[1];
}

describe("settings groups", () => {
  it("covers every group of the sheet, in order", () => {
    expect(SETTINGS_GROUP_META.map((g) => g.id)).toEqual([...SETTINGS_GROUPS]);
  });

  it("gives every group an icon and a colour", () => {
    for (const group of SETTINGS_GROUP_META) {
      expect(group.icon, group.id).toBeTruthy();
      expect(group.color, group.id).toBeTruthy();
      expect(settingsGroupStyle(group.color)).toHaveProperty("--g", settingsColor(group.color));
    }
  });

  it("never gives two neighbouring groups the same colour", () => {
    for (let i = 1; i < SETTINGS_GROUP_META.length; i++) {
      const prev = SETTINGS_GROUP_META[i - 1];
      const next = SETTINGS_GROUP_META[i];
      expect(next?.color, `${prev?.id} and ${next?.id}`).not.toBe(prev?.color);
    }
  });

  it("uses each colour for one group only", () => {
    const colors = SETTINGS_GROUP_META.map((g) => g.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("tints the primary controls with the group colour, except the muted group", () => {
    expect(settingsGroupStyle("meds")).toMatchObject({
      "--primary": "var(--meds)",
      "--primary-foreground": "var(--onD)",
      "--ring": "var(--meds)",
    });
    expect(settingsGroupStyle("muted")).toEqual({ "--g": "hsl(var(--muted-fg))" });
  });

  describe.each([
    ["day", ":root"],
    ["night", ".dark"],
  ] as const)("%s palette", (_name, selector) => {
    const block = themeBlock(selector);

    it.each(SETTINGS_GROUP_META.map((g) => [g.id, g.color] as const))(
      "%s passes WCAG AA as text on the panel and under on-colour text",
      (_id, color) => {
        const c = rgb(block, tokenOf(color));
        // Group-coloured text (header icon, sub-headings) sits on the panel.
        expect(contrast(c, rgb(block, "--panel"))).toBeGreaterThanOrEqual(4.5);
        // Text on the filled primary button / selected segment.
        if (color !== "muted") {
          expect(contrast(c, rgb(block, "--onD"))).toBeGreaterThanOrEqual(4.5);
        }
      },
    );
  });
});
