import { describe, it, expect } from "vitest";
import {
  SETTINGS_GROUP_META,
  settingsColor,
  settingsGroupScope,
  type SettingsColor,
} from "@/components/settings/settings-groups";
import { SETTINGS_GROUPS } from "@/stores/settings-sheet-store";
import { THEMES, contrast, globalsCss, rgb, themeBlock } from "@/__tests__/helpers/palette";

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
      // Every colour but the neutral one opens the app-wide domain scope,
      // which has a rule for it in the design-system stylesheet.
      if (group.color === "muted") continue;
      expect(settingsGroupScope(group.color)).toEqual({ "data-domain": group.color });
      expect(globalsCss).toContain(`[data-domain="${group.color}"] { --d: var(${tokenOf(group.color)}); }`);
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
    // The scope re-points --primary / --ring (domain-scope.test.ts); the
    // muted group only sets its colour, so its controls stay ink.
    expect(settingsGroupScope("meds")).toEqual({ "data-domain": "meds" });
    expect(settingsGroupScope("muted")).toEqual({ style: { "--c": "hsl(var(--muted-fg))" } });
  });

  describe.each(THEMES)("%s palette", (_name, selector) => {
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
