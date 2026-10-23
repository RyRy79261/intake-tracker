import { test, expect, type Page } from "@playwright/test";
import { FAKE_MIC, mockSignedIn, readTable } from "./helpers/voice";

/**
 * A spoken interaction question ("look up the interactions of …") opens the
 * interaction report, not the review list: the names are found and
 * corrected, each one is checked against the user's medicines and fills in
 * on its own, and nothing is logged. "What can't I take?" lists the notes
 * saved on the medicines.
 *
 * Offline: the session check and every AI call are mocked.
 */
test.use(FAKE_MIC);

/** Add "Bisoprolol" through the wizard, with a saved contraindication. */
async function addMedication(page: Page) {
  await page.route("**/api/ai/medicine-search", (route) =>
    route.fulfill({
      json: {
        brandNames: ["Concor"],
        genericName: "Bisoprolol",
        dosageStrengths: ["5mg"],
        commonIndications: ["Heart failure"],
        foodInstruction: "none",
        foodNote: "",
        pillColor: "white",
        pillShape: "round",
        pillDescription: "A white round pill",
        drugClass: "Beta blocker",
        contraindications: ["Decongestants like pseudoephedrine raise your heart rate."],
      },
    }),
  );
  await page.goto("/medications");
  await page.click('button:has-text("Add a prescription")');
  await page.getByLabel("Medicine name or brand").fill("Concor 5mg");
  await page.keyboard.press("Enter");
  await expect(page.locator("text=Found: Bisoprolol")).toBeVisible();
  await page.getByRole("button", { name: "Apply to form" }).click();
  for (let step = 0; step < 5; step++) await page.click('button:has-text("Next")');
  await page.fill('input[placeholder="e.g. 36"]', "30");
  await page.click('button:has-text("Save Medication")');
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5000 });
}

/** Hold "Hold to talk" for over a second and let go. */
async function ask(page: Page, text: string) {
  await page.route("**/api/ai/voice-transcribe", (route) => route.fulfill({ json: { text } }));
  const mic = page.getByRole("button", { name: "Hold to talk to the AI logger" });
  await mic.focus();
  await page.keyboard.down("Space");
  await expect(page.getByTestId("hold-to-talk-timer")).toHaveText("0:01", { timeout: 5_000 });
  await page.keyboard.up("Space");
}

const answer = (substance: string, severity: "AVOID" | "OK", summary: string) => ({
  interactions: [{ substance, medication: "Bisoprolol", severity, description: `${substance} and Bisoprolol.` }],
  summary,
});

test.describe("Voice: interaction questions", () => {
  test.beforeEach(async ({ page }) => {
    await mockSignedIn(page);
    await page.route("**/api/ai/voice-parse", (route) => route.fulfill({ status: 500, json: {} }));
  });

  test("checks each named medicine, fills in one by one and logs nothing", async ({ page }) => {
    await addMedication(page);
    await page.route("**/api/ai/voice-interactions", (route) =>
      route.fulfill({
        json: {
          substances: [
            { heard: "sudo fed rin", name: "Pseudoephedrine", unsure: true },
            { heard: "pan a doll", name: "Paracetamol", brand: "Panadol", unsure: false },
          ],
        },
      }),
    );
    let releaseParacetamol: () => void = () => {};
    const paracetamolHeld = new Promise<void>((r) => (releaseParacetamol = r));
    const checked: string[] = [];
    await page.route("**/api/ai/interaction-check", async (route) => {
      const { substance } = route.request().postDataJSON() as { substance: string };
      checked.push(substance);
      if (substance === "Paracetamol") {
        await paracetamolHeld;
        return route.fulfill({ json: answer("Paracetamol", "OK", "OK. Normal dose.") });
      }
      return route.fulfill({
        json: answer("Pseudoephedrine", "AVOID", "Do not take. It raises blood pressure and heart rate."),
      });
    });
    await page.goto("/");

    await ask(page, "Look up the interactions of sudo fed rin and pan a doll");

    const report = page.getByTestId("interaction-report");
    await expect(report.getByRole("heading", { name: "Interaction check" })).toBeVisible();
    // The first answer is in while the second still loads.
    const verdicts = report.getByTestId("interaction-verdict");
    await expect(verdicts).toHaveCount(1);
    await expect(verdicts.first()).toContainText("Do not take. It raises blood pressure and heart rate.");
    await expect(verdicts.first()).toContainText("Best guess: Pseudoephedrine");
    await expect(report.getByText("Checking Paracetamol…")).toBeVisible();
    await expect(report.getByText(/1 of 2 done/)).toBeVisible();

    releaseParacetamol();
    await expect(verdicts).toHaveCount(2);
    await expect(report.getByTestId("interaction-headline")).toHaveText("Do not take Pseudoephedrine");
    await expect(verdicts.nth(1)).toContainText("Panadol is Paracetamol");
    expect(checked.sort()).toEqual(["Paracetamol", "Pseudoephedrine"]);

    // A misheard name is fixed by typing it.
    await verdicts.first().getByRole("button", { name: "Not this?" }).click();
    await report.getByLabel("What is it called?").fill("Phenylephrine");
    await report.getByRole("button", { name: "Check this" }).click();
    await expect(report.getByText("Heard “Phenylephrine”")).toBeVisible();
    expect(checked).toContain("Phenylephrine");

    await report.getByRole("button", { name: "Done" }).click();
    await expect(report).toBeHidden();
    expect(await readTable(page, "intakeRecords")).toEqual([]);
    expect(await readTable(page, "doseLogs")).toEqual([]);
  });

  test("“What can't I take?” lists the notes saved on the medicines", async ({ page }) => {
    await addMedication(page);
    await page.route("**/api/ai/voice-interactions", (route) =>
      route.fulfill({ json: { substances: [] } }),
    );
    await page.goto("/");

    await ask(page, "What can't I take with my meds?");

    const report = page.getByTestId("interaction-report");
    await expect(report.getByRole("heading", { name: "What you can't take" })).toBeVisible();
    await expect(report.getByText("Decongestants like pseudoephedrine raise your heart rate.")).toBeVisible();
    await expect(report.getByText("Because of Bisoprolol")).toBeVisible();
  });
});
