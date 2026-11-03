import { test, expect, type Page } from "@playwright/test";
import { FAKE_MIC, holdToTalk, mockSignedIn, mockVoiceParse, readTable, voiceRow } from "./helpers/voice";

/**
 * The medical journal: typed and spoken entries, and the doctor's printout.
 *
 * Offline: the session check and every AI call are mocked, and the entries
 * live in IndexedDB (no cloud sync in these specs).
 */
test.use(FAKE_MIC);

const sysBar = (page: Page) => page.getByTestId("sys-bar");
const journal = (page: Page) => page.getByRole("region", { name: "Journal", exact: true });

async function liveEntries(page: Page) {
  return (await readTable(page, "journalEntries")).filter((r) => r.deletedAt === null);
}

test.describe("Journal", () => {
  test.beforeEach(async ({ page }) => {
    await mockSignedIn(page);
  });

  test("a typed entry gets its details from the words, and is listed under Today", async ({ page }) => {
    await page.goto("/");
    await sysBar(page).getByRole("button", { name: "Journal" }).click();
    await expect(journal(page)).toBeVisible();
    await expect(page).toHaveURL(/\/journal$/);

    await journal(page).getByLabel("What did you notice?").fill("Pain in my left knee, about a four, worse on the stairs");
    await expect(journal(page).getByText("Details · 4/10 · Knee, left · Felt")).toBeVisible();
    await journal(page).getByRole("button", { name: "Add to journal" }).click();

    const entry = journal(page).getByTestId("journal-entry");
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText("Knee pain");
    await expect(journal(page).getByRole("heading", { name: /Today/ })).toBeVisible();
    await expect.poll(() => liveEntries(page)).toEqual([
      expect.objectContaining({ finding: "Knee pain", severity: 4, places: ["knee-l"], kind: "symptom", source: "manual" }),
    ]);
  });

  test("spoken entries are reviewed, a missing side is settled, and they land in the journal", async ({ page }) => {
    await mockVoiceParse(page, [
      { kind: "journal_entry", finding: "Bruise", words: "A bruise on my leg", entryKind: "sign", places: "lowerleg" },
      { kind: "journal_entry", finding: "Woke up late", words: "I woke up late", entryKind: "event", timePrecision: "day" },
    ]);
    await page.goto("/");
    await holdToTalk(page);

    const bruise = voiceRow(page, 0);
    await expect(bruise.getByRole("alert")).toHaveText("Which side: shin or calf, left or right?");
    await expect(bruise.getByRole("button", { name: "Approve Journal" })).toBeDisabled();
    await bruise.getByRole("combobox", { name: "Body place" }).click();
    await page.getByRole("option", { name: "Shin or calf, right" }).click();
    await page.keyboard.press("Escape");
    await expect(bruise.getByRole("alert")).toHaveCount(0);

    await page.getByRole("button", { name: /Approve all/i }).click();
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText(/Items \(/)).toHaveCount(0);

    await expect
      .poll(async () => (await liveEntries(page)).map((e) => [e.finding, e.places, e.timePrecision]).sort())
      .toEqual([
        ["Bruise", ["lowerleg-r"], "exact"],
        ["Woke up late", [], "day"],
      ]);

    await sysBar(page).getByRole("button", { name: "Journal" }).click();
    await expect(journal(page).getByTestId("journal-entry")).toHaveCount(2);
    await expect(journal(page).getByText("All day")).toBeVisible();
  });

  test("the printout lists the period oldest first and saves a PDF", async ({ page }) => {
    await page.goto("/journal");
    const words = journal(page).getByLabel("What did you notice?");
    await words.fill("Felt nauseous after lunch");
    await journal(page).getByRole("button", { name: "Add to journal" }).click();
    await expect(journal(page).getByTestId("journal-entry")).toHaveCount(1);
    await expect(words).toHaveValue("");
    await words.fill("Headache, a three out of ten");
    await journal(page).getByRole("button", { name: "Add to journal" }).click();
    await expect(journal(page).getByTestId("journal-entry")).toHaveCount(2);

    await journal(page).getByRole("tab", { name: "Printout" }).click();
    const rows = journal(page).getByTestId("journal-printout").getByRole("row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("Nausea");
    await expect(rows.nth(2)).toContainText("Headache");

    const download = page.waitForEvent("download");
    await journal(page).getByRole("button", { name: /Save as PDF · 2 entries/ }).click();
    expect((await download).suggestedFilename()).toMatch(/^journal-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test("deleting an entry asks first and leaves no words behind", async ({ page }) => {
    await page.goto("/journal");
    await journal(page).getByLabel("What did you notice?").fill("A rash on my arm");
    await journal(page).getByRole("button", { name: "Add to journal" }).click();
    await journal(page).getByRole("button", { name: "Delete Rash" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(journal(page).getByTestId("journal-entry")).toHaveCount(1);
    await journal(page).getByRole("button", { name: "Delete Rash" }).click();
    await expect(dialog).toContainText("no undo");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(journal(page).getByTestId("journal-entry")).toHaveCount(0);
    const [row] = await readTable(page, "journalEntries");
    expect(row).toMatchObject({ words: "", finding: "", places: [], severity: null });
  });
});
