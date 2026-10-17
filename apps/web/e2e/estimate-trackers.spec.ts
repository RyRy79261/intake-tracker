import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * The estimate trackers (urination, defecation) on the phone's Home, and the
 * module list that orders Home and drives the quick links. Both trackers are
 * one configured card, so every journey runs once per tracker. Offline: the
 * cards work against Dexie with no session.
 */

const TRACKERS = [
  {
    name: "Urination",
    section: "section-urination",
    link: "Urine",
    placeholder: "e.g. colour, urgency",
    defaultAmount: "Small",
  },
  {
    name: "Defecation",
    section: "section-defecation",
    link: "Bowel",
    placeholder: "e.g. consistency, urgency",
    defaultAmount: "Medium",
  },
] as const;

/** Home's cards, top to bottom, under Today. */
const HOME_SECTIONS = [
  "section-water",
  "section-food-salt",
  "section-bp",
  "section-weight",
  "section-urination",
  "section-defecation",
];

const entries = (card: Locator) => card.getByTestId("recent-entry");

async function openHome(page: Page) {
  await page.goto("/");
  // The first load of a route under `next dev` can be slow while it compiles.
  await expect(page.locator("#section-defecation")).toBeVisible({ timeout: 30_000 });
}

for (const t of TRACKERS) {
  test.describe(`${t.name} card`, () => {
    const card = (page: Page) => page.locator(`#${t.section}`);
    /**
     * The card, once its entries have loaded, scrolled to the middle of the
     * screen: clear of the fixed quick links and bottom bar, with room for
     * its menus to open.
     */
    const showCard = async (page: Page) => {
      const c = card(page);
      await expect(c.getByText("Nothing logged yet.")).toBeVisible();
      await c.evaluate((el) => el.scrollIntoView({ block: "center" }));
      return c;
    };

    test(`${t.name}: one tap logs an entry; Undo takes it back`, async ({ page }) => {
      await openHome(page);
      const c = await showCard(page);
      await expect(entries(c)).toHaveCount(0);

      await c.getByRole("button", { name: "Medium", exact: true }).click();
      await expect(page.getByText(`${t.name} (medium) recorded`, { exact: true })).toBeVisible();
      await expect(c).toContainText("1 today");
      await expect(entries(c)).toHaveCount(1);
      await expect(entries(c).first()).toContainText(/medium/i);

      await page.getByRole("button", { name: "Undo" }).click();
      await expect(entries(c)).toHaveCount(0);
      await expect(c).not.toContainText("today");
    });

    test(`${t.name}: Add details records the amount and note`, async ({ page }) => {
      await openHome(page);
      const c = await showCard(page);

      await c.getByRole("button", { name: "Add details" }).click();
      const amount = c.getByRole("combobox", { name: "Amount estimate" });
      await expect(amount).toHaveText(t.defaultAmount);
      const note = c.getByLabel("Note (optional)");
      await expect(note).toHaveAttribute("placeholder", t.placeholder);

      await amount.click();
      await page.getByRole("option", { name: "Large" }).click();
      await note.fill("after breakfast");
      await c.getByRole("button", { name: "Record with details" }).click();

      await expect(page.getByText(`${t.name} recorded`, { exact: true })).toBeVisible();
      await expect(entries(c)).toHaveCount(1);
      await expect(entries(c).first()).toContainText("after breakfast");
      await expect(entries(c).first()).toContainText(/large/i);
      // The form closes after a save.
      await expect(c.getByRole("button", { name: "Record with details" })).toHaveCount(0);
    });

    test(`${t.name}: inline edit changes the amount and note`, async ({ page }) => {
      await openHome(page);
      const c = await showCard(page);
      await c.getByRole("button", { name: "Small", exact: true }).click();
      await expect(entries(c)).toHaveCount(1);

      await entries(c).first().getByRole("button").first().click();
      await c.getByRole("combobox", { name: "Amount estimate" }).click();
      await page.getByRole("option", { name: "Large" }).click();
      await c.getByLabel("Entry note").fill("edited");
      await c.getByRole("button", { name: "Save", exact: true }).click();

      await expect(page.getByText("Entry updated", { exact: true })).toBeVisible();
      await expect(entries(c)).toHaveCount(1);
      await expect(entries(c).first()).toContainText("edited");
      await expect(entries(c).first()).toContainText(/large/i);
    });

    test(`${t.name}: delete removes the entry`, async ({ page }) => {
      await openHome(page);
      const c = await showCard(page);
      await c.getByRole("button", { name: "Large", exact: true }).click();
      await expect(entries(c)).toHaveCount(1);

      await entries(c).first().getByRole("button", { name: "Delete entry" }).click();
      await expect(entries(c)).toHaveCount(0);
      await expect(c).not.toContainText("today");
    });

    test(`${t.name}: entries stay on their own card`, async ({ page }) => {
      await openHome(page);
      await (await showCard(page)).getByRole("button", { name: "Small", exact: true }).click();
      await expect(entries(card(page))).toHaveCount(1);
      const other = TRACKERS.find((o) => o.name !== t.name)!;
      await expect(entries(page.locator(`#${other.section}`))).toHaveCount(0);
    });
  });
}

test.describe("Home modules", () => {
  test("Home shows the module cards in order, each under its section", async ({ page }) => {
    await openHome(page);
    const ids = await page.locator(".wc-mods > div").evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(HOME_SECTIONS);
    await expect(page.locator("#section-urination").getByTestId("urination-card")).toBeVisible();
    await expect(page.locator("#section-defecation").getByTestId("defecation-card")).toBeVisible();
  });

  test("the quick links jump to each tracker card", async ({ page }) => {
    await openHome(page);
    const links = page.getByTestId("quick-links");
    await expect(links.getByRole("button")).toHaveText(["Liquids", "Food", "BP", "Weight", "Urine", "Bowel"]);

    for (const t of TRACKERS) {
      // From the top of Home the card is off screen; its link brings it on.
      await page.evaluate(() => window.scrollTo(0, 0));
      const title = page.locator(`#${t.section}`).getByText(t.name, { exact: true });
      await expect(title).not.toBeInViewport();
      await links.getByRole("button", { name: t.link }).click();
      await expect(title).toBeInViewport({ ratio: 1 });
    }
    // The card in view is marked once it reaches the line under the sys-bar.
    await links.getByRole("button", { name: "Urine" }).click();
    await expect(links.getByRole("button", { name: "Urine" })).toHaveAttribute("aria-current", "true");
  });
});
