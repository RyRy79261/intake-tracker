import { test, expect } from "@playwright/test";
import { FAKE_MIC, holdToTalk, mockSignedIn, mockVoiceParse, voiceRow } from "./helpers/voice";

/**
 * The voice review row checks every item against the voice item contract
 * (@intake/core/voice-items), the same limits the parse route uses. A row
 * that fails cannot be approved, and "Approve all" skips it.
 *
 * Offline: the session check and every AI call are mocked.
 */
test.use(FAKE_MIC);

test.describe("Voice review: the item contract", () => {
  test.beforeEach(async ({ page }) => {
    await mockSignedIn(page);
  });

  test("refuses out-of-range values and accepts in-range ones", async ({ page }) => {
    await mockVoiceParse(page, [
      { kind: "water", ml: 250 },
      // Below the route's 1 ml minimum. The review used to accept it.
      { kind: "water", ml: 0.5 },
      { kind: "salt", sodiumMg: 25000 },
      // 0 g: the route's minimum is 1 g. The review used to accept it.
      { kind: "food", description: "toast", grams: 0 },
      { kind: "alcohol", description: "beer", abvPercent: 120, volumeMl: 500 },
      // Longer than the route's 200 characters. The review used to accept it.
      { kind: "food", description: "x".repeat(201) },
    ]);
    await page.goto("/");
    await holdToTalk(page);

    await expect(voiceRow(page, 0).getByRole("alert")).toHaveCount(0);
    await expect(voiceRow(page, 0).getByRole("button", { name: "Approve Water" })).toBeEnabled();

    const refused: Array<[number, RegExp, string]> = [
      [1, /Water must be between 1 and 10000/, "Approve Water"],
      [2, /Sodium must be between 1 and 20000/, "Approve Sodium"],
      [3, /Grams must be between 1 and 5000/, "Approve Food"],
      [4, /ABV must be between 0 and 95/, "Approve Alcohol"],
      [5, /Description must be at most 200 characters/, "Approve Food"],
    ];
    for (const [index, message, approve] of refused) {
      const row = voiceRow(page, index);
      await expect(row.getByRole("alert")).toHaveText(message);
      await expect(row.getByRole("button", { name: approve })).toBeDisabled();
    }

    // Approve all takes only the valid row.
    await page.getByRole("button", { name: /Approve all/i }).click();
    await expect(page.getByText("Items (1 approved · 5 pending)")).toBeVisible();

    // Fixing a refused value makes the row approvable.
    const half = voiceRow(page, 1);
    await half.getByRole("spinbutton").first().fill("300");
    await expect(half.getByRole("alert")).toHaveCount(0);
    await half.getByRole("button", { name: "Approve Water" }).click();
    await expect(page.getByText("Items (2 approved · 4 pending)")).toBeVisible();
  });

  test("a description of only spaces cannot be approved until it is filled in", async ({
    page,
  }) => {
    await mockVoiceParse(page, [{ kind: "food", description: "   ", grams: 40 }]);
    await page.goto("/");
    await holdToTalk(page);

    const row = voiceRow(page, 0);
    await expect(row.getByRole("alert")).toHaveText("Description is required.");
    await expect(row.getByRole("button", { name: "Approve Food" })).toBeDisabled();

    await row.getByRole("textbox").first().fill("toast");
    await expect(row.getByRole("alert")).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Approve Food" })).toBeEnabled();
  });
});
