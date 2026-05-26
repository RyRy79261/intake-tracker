import { test, expect, type Page } from "@playwright/test";

/**
 * Record-lifecycle E2E (P1 #12 from the May 2026 audit).
 *
 * The audit identified the single largest behavioural gap in the existing
 * Playwright suite: no spec exercises the create → edit → delete → undo
 * sequence for any record type. dashboard.spec.ts tests creation, history.
 * spec.ts tests "does the new record show up on /analytics?", but the
 * edit/delete/undo path is untouched.
 *
 * This file ships the water lifecycle. The remaining record types (weight,
 * BP, dose, eating) follow the same pattern and can be added incrementally
 * — see the per-row Edit/Delete buttons in src/components/history/record-row.tsx
 * and the per-type edit dialogs in src/components/edit-{intake,weight,blood-pressure,...}-dialog.tsx.
 */

async function dismissAnalyticsIntro(page: Page) {
  // /analytics renders a one-shot intro dialog on first visit. It intercepts
  // pointer events so any locator.click() against the records list silently
  // misses until it's dismissed. Mirrors the helper in history.spec.ts.
  const gotIt = page.getByRole("button", { name: /got it/i });
  await gotIt.click({ timeout: 10_000 });
  await expect(gotIt).toBeHidden();
}

async function gotoRecordsTab(page: Page) {
  await page.goto("/analytics");
  await dismissAnalyticsIntro(page);
  await page.locator('[role="tab"]', { hasText: "Records" }).click();
  // The tabs use Radix; wait for the panel to actually become active before
  // looking up rows inside it.
  await expect(
    page.locator('[role="tabpanel"][data-state="active"]')
  ).toBeVisible();
}

/**
 * Locate the records-tab row whose measurement column contains the given
 * text. The records list is a single flex column where each row's first
 * direct child is the type-label + measurement, and the second is the
 * Edit/Delete button cluster. We scope to "Water" + the measurement so we
 * never accidentally pick up a sibling row from another type.
 */
function waterRowByMeasurement(page: Page, measurement: string) {
  // record-row.tsx renders the row as a div with role="button", containing
  // an inner type-label span ("Water") and the measurement span ("250 ml").
  return page
    .locator('div[role="button"]')
    .filter({ has: page.locator("text=Water").first() })
    .filter({ hasText: measurement });
}

test.describe("Water intake lifecycle: create → edit → delete → undo", () => {
  test("happy path: full lifecycle from dashboard to Records tab and back", async ({
    page,
  }) => {
    // ----- CREATE -----
    await page.goto("/");
    const waterCard = page.locator("#section-water");
    await expect(waterCard).toBeVisible();
    // Default water increment is 250 ml — see src/stores/settings-store.ts
    // (waterIncrement). Confirm Entry submits the pending amount.
    await waterCard
      .locator("button", { hasText: "Confirm Entry" })
      .click();
    await expect(
      page.getByText("Water intake recorded", { exact: true })
    ).toBeVisible();

    // Navigate to the Records tab; the new entry must show up there.
    await gotoRecordsTab(page);
    const row250 = waterRowByMeasurement(page, "250 ml");
    await expect(row250).toBeVisible({ timeout: 10_000 });

    // ----- EDIT -----
    // Open the edit dialog for the just-created row. The Edit button is
    // aria-label="Edit entry" — scope to the matching row to avoid clicking
    // a different row's button.
    await row250
      .getByRole("button", { name: "Edit entry" })
      .click();
    await expect(
      page.getByRole("heading", { name: /edit water entry/i })
    ).toBeVisible();

    // Change the amount from 250 to 500 and save.
    const amountInput = page.locator("#edit-amount");
    await amountInput.fill("500");
    await page.getByRole("button", { name: "Save Changes" }).click();

    // Dialog closes; the row's measurement now reflects the new amount.
    await expect(
      page.getByRole("heading", { name: /edit water entry/i })
    ).toBeHidden();
    const row500 = waterRowByMeasurement(page, "500 ml");
    await expect(row500).toBeVisible({ timeout: 10_000 });
    // And the original measurement row is gone — there must be exactly one
    // water record at this point.
    await expect(waterRowByMeasurement(page, "250 ml")).toHaveCount(0);

    // ----- DELETE -----
    // The delete button on each row is aria-label="Delete entry". On
    // success, two toasts fire: useDeleteIntake.onSuccess shows the
    // showUndoToast ("Record deleted" with an Undo action), and
    // records-tab.handleDelete shows a separate "Entry deleted" toast.
    // We assert the Undo action is reachable — that's the bit users
    // interact with.
    await row500
      .getByRole("button", { name: "Delete entry" })
      .click();

    // Row disappears from the list (the underlying record is soft-deleted).
    await expect(row500).toHaveCount(0, { timeout: 5_000 });

    // ----- UNDO -----
    // showUndoToast renders a <ToastAction altText="Undo">Undo</ToastAction>.
    // It auto-dismisses after 5s — we click within that window.
    const undoButton = page.getByRole("button", { name: "Undo" });
    await expect(undoButton).toBeVisible({ timeout: 5_000 });
    await undoButton.click();

    // The row reappears with the post-edit amount intact (undo restores
    // the record, not its prior version).
    await expect(waterRowByMeasurement(page, "500 ml")).toBeVisible({
      timeout: 10_000,
    });
  });
});
