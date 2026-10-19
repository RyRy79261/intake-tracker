import { test, expect, type Page } from "@playwright/test";
import { FAKE_MIC, holdToTalk, mockSignedIn, readTable, voiceRow } from "./helpers/voice";

/**
 * Voice acts on the user's own medications: it marks the doses of a dose time
 * taken (and corrects their time), adds a refill to a medicine's stock, and
 * records a medicine that is not on the list by name only. It never adds a
 * prescription.
 *
 * Offline: the session check and every AI call are mocked.
 */
test.use(FAKE_MIC);

/** Add "Aviolix Compound" (brand "Aviolix 75", 30 pills) with the wizard's default dose time. */
async function addMedication(page: Page): Promise<string> {
  await page.route("**/api/ai/medicine-search", (route) =>
    route.fulfill({
      json: {
        brandNames: ["Aviolix"],
        genericName: "Aviolix Compound",
        dosageStrengths: ["75mg"],
        commonIndications: ["Testing"],
        foodInstruction: "after",
        foodNote: "Take with food",
        pillColor: "purple",
        pillShape: "round",
        pillDescription: "A purple round pill",
        drugClass: "Test Class",
      },
    }),
  );
  await page.goto("/medications");
  await page.click('button:has-text("Add a prescription")');
  await page.getByLabel("Medicine name or brand").fill("Aviolix 75mg");
  await page.keyboard.press("Enter");
  await expect(page.locator("text=Found: Aviolix Compound")).toBeVisible();
  await page.getByRole("button", { name: "Apply to form" }).click();
  for (let step = 0; step < 5; step++) await page.click('button:has-text("Next")');
  await expect(page.locator("text=Current stock")).toBeVisible();
  await page.fill('input[placeholder="e.g. 36"]', "30");
  await page.click('button:has-text("Save Medication")');
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5000 });

  const [schedule] = await readTable(page, "phaseSchedules");
  return String(schedule?.time);
}

/** Mock the voice routes; the parse returns `items` and records what it was sent. */
async function mockParse(page: Page, items: unknown[]) {
  const sent: { medications?: unknown }[] = [];
  await page.route("**/api/ai/voice-transcribe", (route) =>
    route.fulfill({ json: { text: "dictated in an e2e test" } }),
  );
  await page.route("**/api/ai/voice-parse", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { items, reasoning: "mocked" } });
  });
  return sent;
}

test.describe("Voice: medications", () => {
  test.beforeEach(async ({ page }) => {
    await mockSignedIn(page);
  });

  test("marks a dose time taken, refills stock and logs an unlisted medicine", async ({ page }) => {
    const doseTime = await addMedication(page);
    const sent = await mockParse(page, [
      { kind: "scheduled_dose", slotTime: doseTime, action: "taken" },
      { kind: "stock_refill", medicine: "Aviolix", pills: 100 },
      { kind: "extra_medicine", medicine: "Paracetamol", amount: 1, unit: "tablet" },
    ]);
    await page.goto("/");
    await holdToTalk(page);

    // The parser was told what is on the list.
    expect(sent[0]?.medications).toEqual([
      { name: "Aviolix Compound", brands: ["Aviolix 75"], doseTimes: [doseTime] },
    ]);

    // Each row says what it will do before anything is saved.
    await expect(voiceRow(page, 0).getByTestId("voice-item-0-plan")).toContainText(
      "Aviolix Compound",
    );
    await expect(voiceRow(page, 0).getByTestId("voice-item-0-plan")).toContainText("mark taken");
    await expect(voiceRow(page, 1).getByTestId("voice-item-1-plan")).toHaveText(
      /Aviolix 75: add 100 pills \(stock 30 → 130\)/,
    );
    await expect(voiceRow(page, 2).getByTestId("voice-item-2-plan")).toHaveText(
      /Paracetamol 1 tablet: not on your medication list/,
    );

    await page.getByRole("button", { name: /Approve all/i }).click();
    await page.getByRole("button", { name: /^Save 3$/ }).click();
    await expect(page.getByText("Saved 3 of 3", { exact: true })).toBeVisible();

    const logs = await readTable(page, "doseLogs");
    const scheduled = logs.find((l) => l.kind !== "prn");
    expect(scheduled?.status).toBe("taken");
    const unlisted = logs.find((l) => l.medicineName === "Paracetamol");
    expect(unlisted).toMatchObject({ kind: "prn", status: "taken", doseUnit: "tablet" });
    expect(unlisted?.prescriptionId).toBeUndefined();

    // 30 − the dose's pills + 100. No new prescription or stock item.
    expect(await readTable(page, "prescriptions")).toHaveLength(1);
    const [stock] = await readTable(page, "inventoryItems");
    expect(Number(stock?.currentStock)).toBeGreaterThan(100);
    expect((await readTable(page, "inventoryTransactions")).some((t) => t.type === "refill")).toBe(
      true,
    );

    // The unlisted medicine shows with the day's other doses.
    await page.goto("/medications");
    await expect(page.getByText("Not on your medication list")).toBeVisible();
    await expect(page.getByText("Paracetamol 1 tablet")).toBeVisible();
  });

  test("refuses a medicine that is not on the list instead of adding it", async ({ page }) => {
    await mockParse(page, [{ kind: "stock_refill", medicine: "Atorvastatin", pills: 30 }]);
    await page.goto("/");
    await holdToTalk(page);

    const row = voiceRow(page, 0);
    await expect(row.getByRole("alert")).toHaveText('"Atorvastatin" is not on your medication list.');
    await expect(row.getByRole("button", { name: "Approve Refill" })).toBeDisabled();
  });
});
