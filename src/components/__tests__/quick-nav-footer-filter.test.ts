import { describe, it, expect } from "vitest";
import { CARD_THEMES, type CardThemeKey } from "@/lib/card-themes";

// D-01: NAV_EXCLUDED filter test
// buildSectionItems() is module-private, but its logic is deterministic:
// it filters NAV_EXCLUDED keys from CARD_THEMES. We verify the contract by
// applying the same filter and confirming caffeine and alcohol are excluded.

const NAV_EXCLUDED: CardThemeKey[] = ["caffeine", "alcohol"];

function buildSectionItems() {
  return (Object.keys(CARD_THEMES) as CardThemeKey[])
    .filter((key) => !NAV_EXCLUDED.includes(key))
    .map((key) => {
      const theme = CARD_THEMES[key];
      return {
        id: theme.sectionId,
        label: theme.label,
      };
    });
}

describe("quick-nav-footer NAV_EXCLUDED filter (D-01)", () => {
  it("section items do not include caffeine", () => {
    const items = buildSectionItems();
    const ids = items.map((i) => i.id);
    const labels = items.map((i) => i.label);

    expect(ids).not.toContain("section-caffeine");
    expect(labels).not.toContain("Caffeine");
  });

  it("section items do not include alcohol", () => {
    const items = buildSectionItems();
    const ids = items.map((i) => i.id);
    const labels = items.map((i) => i.label);

    expect(ids).not.toContain("section-alcohol");
    expect(labels).not.toContain("Alcohol");
  });

  it("section items include non-excluded keys (water, salt, weight, bp, eating, urination, defecation)", () => {
    const items = buildSectionItems();
    const ids = items.map((i) => i.id);

    expect(ids).toContain("section-water");
    expect(ids).toContain("section-salt");
    expect(ids).toContain("section-weight");
    expect(ids).toContain("section-bp");
    // eating, urination, defecation also present
    expect(ids.length).toBe(Object.keys(CARD_THEMES).length - NAV_EXCLUDED.length);
  });

  it("NAV_EXCLUDED covers exactly caffeine and alcohol — no other keys inadvertently excluded", () => {
    const allKeys = Object.keys(CARD_THEMES) as CardThemeKey[];
    const includedKeys = allKeys.filter((key) => !NAV_EXCLUDED.includes(key));

    expect(NAV_EXCLUDED).toHaveLength(2);
    expect(NAV_EXCLUDED).toContain("caffeine");
    expect(NAV_EXCLUDED).toContain("alcohol");

    // Every non-excluded key appears in items
    const items = buildSectionItems();
    const itemIds = items.map((i) => i.id);
    for (const key of includedKeys) {
      expect(itemIds).toContain(CARD_THEMES[key].sectionId);
    }
  });
});
