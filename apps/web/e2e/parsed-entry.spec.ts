import { test, expect, type Page } from "@playwright/test";
import {
  FAKE_MIC,
  holdToTalk,
  mockSignedIn,
  mockVoiceParse,
  readTable,
} from "./helpers/voice";

/**
 * The parsed-entry logger: how a voice item or the Food card's detail form
 * becomes records. Postgres keeps intake amounts and caffeine mg as integers,
 * so what is stored on the device must be whole numbers too; the stored
 * values are read straight from IndexedDB.
 *
 * Offline: the session check and every AI call are mocked, and sync is
 * blocked. In CI the session is real, and the app would switch to cloud sync
 * and pull rows other specs left on the server, so a count here would see them.
 */
test.use(FAKE_MIC);

type Row = Record<string, unknown>;

const live = (rows: Row[]) => rows.filter((r) => r.deletedAt === null);

async function isolate(page: Page) {
  await mockSignedIn(page);
  await page.route("**/api/sync/**", (route) => route.abort());
}

async function saveVoice(page: Page, items: unknown[]) {
  await mockVoiceParse(page, items);
  await page.goto("/");
  await holdToTalk(page);
  await page.getByRole("button", { name: /Approve all/i }).click();
  await expect(page.getByText(`Items (${items.length} approved · 0 pending)`)).toBeVisible();
  await page.getByRole("button", { name: /^Save/ }).click();
  // The review list closes only when every item saved.
  await expect(page.getByText(/Items \(/)).toHaveCount(0);
}

async function parseOnFoodCard(page: Page, text: string, result: Record<string, unknown>) {
  await page.route("**/api/ai/parse", (route) =>
    route.fulfill({ json: { measurement_type: "sodium", reasoning: "mocked", ...result } }),
  );
  await page.goto("/");
  const food = page.getByRole("textbox", { name: "Describe food for AI nutritional parsing" });
  await food.scrollIntoViewIfNeeded();
  await food.fill(text);
  await food.press("Enter");
}

test.describe("Parsed entries: voice", () => {
  test.beforeEach(async ({ page }) => {
    await isolate(page);
  });

  test("stores whole numbers for fractional voice values", async ({ page }) => {
    await saveVoice(page, [
      { kind: "food", description: "smoothie", waterMl: 236.6, sodiumMg: 41.5, sugarG: 12.4 },
      // 8 fl oz by the prompt's own conversion.
      { kind: "water", ml: 236.588 },
      { kind: "salt", sodiumMg: 393.4 },
      { kind: "caffeine", description: "espresso", caffeineMg: 63.4 },
    ]);

    const intakes = live(await readTable(page, "intakeRecords"));
    const amounts = (type: string, source: string) =>
      intakes.filter((r) => r.type === type && r.source === source).map((r) => r.amount);
    expect(amounts("water", "voice")).toEqual([237]);
    expect(amounts("salt", "voice")).toEqual([393]);
    expect(amounts("water", "manual:food_water_content")).toEqual([237]);
    expect(amounts("salt", "manual:sodium")).toEqual([42]);
    expect(amounts("sugar", "manual:sugar")).toEqual([12]);
    for (const row of intakes) expect(Number.isInteger(row.amount)).toBe(true);

    const [dose] = live(await readTable(page, "substanceRecords"));
    expect(dose).toMatchObject({ type: "caffeine", amountMg: 63 });
  });

  test("saves a beer as one drink with one water row", async ({ page }) => {
    await saveVoice(page, [{ kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 }]);

    const intakes = live(await readTable(page, "intakeRecords"));
    const substances = live(await readTable(page, "substanceRecords"));
    expect(intakes.map((r) => [r.type, r.amount])).toEqual([["water", 500]]);
    expect(substances).toHaveLength(1);
    expect(substances[0]).toMatchObject({ type: "alcohol", abvPercent: 5, volumeMl: 500 });
    expect(substances[0]!.groupId).toBe(intakes[0]!.groupId);
    expect(live(await readTable(page, "eatingRecords"))).toHaveLength(0);
  });
});

test.describe("Parsed entries: Food card", () => {
  test.beforeEach(async ({ page }) => {
    await isolate(page);
  });

  test("saves an AI-parsed meal as one rounded group", async ({ page }) => {
    await parseOnFoodCard(page, "bowl of soup", {
      water: 180.4,
      salt: 450.6,
      sugar: 3.4,
      potassium: null,
      is_drink: false,
    });
    await expect(page.locator("#eating-sodium")).toHaveValue("450.6");
    await page.getByRole("button", { name: "Record with details" }).click();
    await expect(page.getByText("Meal with details recorded").first()).toBeVisible();

    const meals = live(await readTable(page, "eatingRecords"));
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ note: "bowl of soup", groupSource: "ai_food_parse" });
    const intakes = live(await readTable(page, "intakeRecords"));
    expect(Object.fromEntries(intakes.map((r) => [r.type, r.amount]))).toEqual({
      water: 180,
      salt: 451,
      sugar: 3,
    });
    expect(intakes.every((r) => r.groupId === meals[0]!.groupId)).toBe(true);
    // How the sodium was typed is kept beside the whole-number mg.
    expect(intakes.find((r) => r.type === "salt")).toMatchObject({ sourceAmount: 450.6, sourceUnit: "mg" });
  });

  test("saves an AI-parsed drink through the Drink module", async ({ page }) => {
    await parseOnFoodCard(page, "can of cola", {
      water: 330,
      salt: 10,
      sugar: 35.2,
      potassium: null,
      is_drink: true,
      caffeine_mg: 34,
      abv_percent: null,
    });
    await expect(page.locator("#eating-water")).toHaveValue("330");
    await page.getByRole("button", { name: "Record with details" }).click();
    await expect(page.getByText("Drink recorded").first()).toBeVisible();

    // A drink: one water row at the full volume, the caffeine and solutes in
    // its group, and no meal row.
    expect(live(await readTable(page, "eatingRecords"))).toHaveLength(0);
    const intakes = live(await readTable(page, "intakeRecords"));
    const water = intakes.filter((r) => r.type === "water");
    expect(water.map((r) => r.amount)).toEqual([330]);
    expect(Object.fromEntries(intakes.map((r) => [r.type, r.amount]))).toEqual({
      water: 330,
      salt: 10,
      sugar: 35,
    });
    const [caffeine] = live(await readTable(page, "substanceRecords"));
    expect(caffeine).toMatchObject({ type: "caffeine", amountMg: 34, volumeMl: 330 });
    expect(intakes.every((r) => r.groupId === caffeine!.groupId)).toBe(true);
  });
});
