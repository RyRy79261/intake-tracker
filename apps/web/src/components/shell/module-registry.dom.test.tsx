// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { HOME_CARDS, MODULES, MODULES_BY_ID } from "@/components/shell/module-registry";
import { QUICK_LINKS } from "@/components/shell/quick-links";
import { DESK_MODULES, MODULE_IDS } from "@/lib/desk-modules";
import { domainColor } from "@/lib/domain-colors";

describe("module registry", () => {
  it("lists every module once, in the module order", () => {
    expect(MODULES.map((m) => m.id)).toEqual([...MODULE_IDS]);
    for (const id of MODULE_IDS) expect(MODULES_BY_ID[id].id).toBe(id);
  });

  it("Home's cards are every module but Today, each under its section", () => {
    expect(HOME_CARDS.map((m) => [m.id, m.sectionId])).toEqual([
      ["liquids", "section-water"],
      ["food", "section-food-salt"],
      ["bp", "section-bp"],
      ["weight", "section-weight"],
      ["wee", "section-urination"],
      ["bowel", "section-defecation"],
    ]);
  });

  it("the quick links jump to Home's sections, in Home's order", () => {
    expect(QUICK_LINKS).toEqual([
      { section: "section-water", label: "Liquids", icon: "drop", domain: "water" },
      { section: "section-food-salt", label: "Food", icon: "food", domain: "sodium" },
      { section: "section-bp", label: "BP", icon: "bp", domain: "bp" },
      { section: "section-weight", label: "Weight", icon: "weight", domain: "weight" },
      { section: "section-urination", label: "Urine", icon: "wee", domain: "bath" },
      { section: "section-defecation", label: "Bowel", icon: "bowel", domain: "bath" },
    ]);
  });

  it("a module's colour is its domain colour, ink for Today", () => {
    expect(DESK_MODULES.today.color).toBe("hsl(var(--fg))");
    expect(DESK_MODULES.wee.color).toBe(domainColor("bath"));
    expect(DESK_MODULES.food.color).toBe(domainColor("sodium"));
  });

  it.each([
    ["wee", "section-urination", "urination-card"],
    ["bowel", "section-defecation", "defecation-card"],
  ] as const)("the %s body is its tracker card inside its section", async (id, sectionId, testId) => {
    const { Body } = MODULES_BY_ID[id];
    const { container } = await renderWithFixtures(<Body />);
    const card = await screen.findByTestId(testId);
    expect(container.querySelector(`#${sectionId}`)).toContainElement(card);
  });
});
