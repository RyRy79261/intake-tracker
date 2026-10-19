import { test, expect, type Page } from "@playwright/test";
import { FAKE_MIC, holdToTalk, mockSignedIn, readTable, voiceRow } from "./helpers/voice";
import { berlin, DAY, doseLogs, prepare, seedSlot, stocks, ZONE } from "./helpers/meds";

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

    // Past the dose's late window (the wizard's default time is in the
    // morning), the row asks when it was taken.
    const choice = voiceRow(page, 0).getByTestId("voice-item-0-time-choice");
    if (await choice.isVisible()) await choice.getByRole("button", { name: "Take now" }).click();
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

/**
 * Voice follows the Today rules (Medisafe parity, PR 1): the late window
 * asks when a late dose was taken, and a dose time said as a whole changes
 * only its open doses. Seeded in IndexedDB, clock on 2026-10-19, offline.
 */
test.describe("Voice: the late window and the bulk rule", () => {
  test.use({ timezoneId: ZONE, locale: "en-GB" });

  test.beforeEach(async ({ page }) => {
    await mockSignedIn(page);
  });

  test('"took my morning meds" at 10:00 asks when; at 08:45 it records now with no choice', async ({ page }) => {
    await prepare(page, "10:00");
    const [dose] = await seedSlot(page, 1);
    await mockParse(page, [{ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }]);
    await page.goto("/");
    await holdToTalk(page);

    const row = voiceRow(page, 0);
    const choice = row.getByTestId("voice-item-0-time-choice");
    await expect(choice).toBeVisible();
    await expect(choice.getByRole("button", { name: "Take now" })).toBeVisible();
    await expect(choice.getByRole("button", { name: "Take at a specific time" })).toBeVisible();
    await expect(choice.getByRole("button", { name: "Skip" })).toBeVisible();
    await expect(row.getByRole("alert")).toHaveText("Pick when you took them.");
    await expect(row.getByRole("button", { name: "Approve Dose" })).toBeDisabled();

    // "Take at a specific time" fills the time field with the dose time.
    await choice.getByRole("button", { name: "Take at a specific time" }).click();
    await expect(row.getByLabel("Time", { exact: true })).toHaveValue(`${DAY}T08:30`);
    await row.getByRole("button", { name: "Approve Dose" }).click();
    await page.getByRole("button", { name: /^Save 1$/ }).click();
    await expect(page.getByText("Saved 1 of 1", { exact: true })).toBeVisible();
    const log = (await doseLogs(page)).get(dose!.scheduleId);
    expect(log).toMatchObject({ status: "taken", actionTimestamp: berlin("08:30") });
  });

  test("at 08:45 a take with no time said records now, with no choice", async ({ page }) => {
    await prepare(page, "08:45");
    const [dose] = await seedSlot(page, 1);
    await mockParse(page, [{ kind: "scheduled_dose", slotTime: "08:30", action: "taken" }]);
    await page.goto("/");
    await holdToTalk(page);

    const row = voiceRow(page, 0);
    await expect(row.getByTestId("voice-item-0-plan")).toContainText("mark taken");
    await expect(row.getByTestId("voice-item-0-time-choice")).toHaveCount(0);
    await row.getByRole("button", { name: "Approve Dose" }).click();
    await page.getByRole("button", { name: /^Save 1$/ }).click();
    await expect(page.getByText("Saved 1 of 1", { exact: true })).toBeVisible();

    const taken = Number((await doseLogs(page)).get(dose!.scheduleId)?.actionTimestamp);
    // The save time: 08:45 and the few seconds the test took.
    expect(taken - berlin("08:45")).toBeGreaterThanOrEqual(0);
    expect(taken - berlin("08:45")).toBeLessThan(5 * 60_000);
  });

  test('"log all my remaining 08:30 meds as taken at 09:00" leaves a dose already taken unchanged', async ({ page }) => {
    await prepare(page, "09:20");
    const doses = await seedSlot(page, 3, [{ status: "taken", at: "08:35" }]);
    await mockParse(page, [
      {
        kind: "scheduled_dose",
        slotTime: "08:30",
        action: "taken",
        when: { kind: "absolute", localDateTime: `${DAY}T09:00` },
      },
    ]);
    await page.goto("/");
    await holdToTalk(page);

    const plan = voiceRow(page, 0).getByTestId("voice-item-0-plan");
    await expect(plan).toContainText("Generic1 50 mg: no change (already taken at 08:35)");
    await expect(plan).toContainText("Generic2 50 mg: mark taken at 09:00");
    await voiceRow(page, 0).getByRole("button", { name: "Approve Dose" }).click();
    await page.getByRole("button", { name: /^Save 1$/ }).click();
    await expect(page.getByText("Saved 1 of 1", { exact: true })).toBeVisible();

    const logs = await doseLogs(page);
    expect(logs.get(doses[0]!.scheduleId)).toMatchObject({ status: "taken", actionTimestamp: berlin("08:35") });
    expect(logs.get(doses[1]!.scheduleId)).toMatchObject({ status: "taken", actionTimestamp: berlin("09:00") });
    expect(logs.get(doses[2]!.scheduleId)).toMatchObject({ status: "taken", actionTimestamp: berlin("09:00") });
    expect(await stocks(page, doses)).toEqual([29, 29, 29]);
  });
});
