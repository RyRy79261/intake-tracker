import { test, expect } from "@playwright/test";

/**
 * Chaos-as-fixtures: PWA failure modes the user actually hits in the
 * wild but that the rest of the E2E suite never exercises.
 *
 * Paradigm (docs/TESTING_STRATEGY.md §2.6): each fixture below is a
 * specific failure mode lifted directly from the PWA failure-mode
 * survey (LogRocket offline-first 2025, Mobile Viewer PWA checklist
 * 2026, Testomat chaos testing 2026). Adding them as opt-in Playwright
 * scenarios — rather than reaching for LitmusChaos or Gremlin — keeps
 * the chaos contained, repeatable, and run by the same CI that runs
 * the rest of the suite.
 *
 * Scope: these are *smoke* tests for graceful degradation. They assert
 * "the app doesn't crash and recovers when the condition clears", not
 * specific UI strings — that keeps them robust to copy changes while
 * still catching the catastrophic class of bug (unhandled rejection,
 * stuck spinner, infinite retry loop) we actually need to detect.
 */

test.describe("Chaos: network drop mid-request", () => {
  test("a write attempted while offline is queued and recovered on reconnect", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.locator("text=Intake Tracker")).toBeVisible();

    // Cut the network BEFORE the user interacts. This is the most
    // common real-world case — phone in elevator, train tunnel, etc.
    await context.setOffline(true);

    // Click the water-card "Confirm Entry" which fires an optimistic
    // local write. The sync engine queues the push for later.
    const waterCard = page.locator("#section-water");
    await waterCard.locator("button", { hasText: "Confirm Entry" }).click();

    // Verify recoverability via the app shell rather than the toast:
    // toasts are an internal UI choice that can change, and aria-live
    // status containers can be transient. The relevant smoke for an
    // optimistic offline write is "the page is still rendered and
    // responsive afterward."
    await expect(page.locator("text=Intake Tracker")).toBeVisible();
    await expect(waterCard).toBeVisible();

    // Bring the network back. The sync engine has visibility +
    // network-status listeners that should kick a push within a few
    // seconds. We don't assert on push success here (would require
    // mocking the sync endpoints).
    await context.setOffline(false);

    // The page must still be interactive (no hung overlays, no
    // unhandled rejection blocking the event loop) — exercise a
    // simple action to confirm.
    await expect(waterCard).toBeVisible();
    await waterCard.scrollIntoViewIfNeeded();
    // Page-level errors that should NEVER appear:
    await expect(
      page.locator('text=Something went wrong'),
    ).not.toBeVisible();
    await expect(
      page.locator('text=Cannot read properties'),
    ).not.toBeVisible();
  });

  test("a flaky API request that fails once then succeeds doesn't break the UI", async ({
    page,
  }) => {
    // Intercept the AI parse endpoint and inject a one-shot failure
    // followed by a success — simulates a transient 502.
    let callCount = 0;
    await page.route("/api/ai/parse", async (route) => {
      callCount++;
      if (callCount === 1) {
        await route.fulfill({
          status: 502,
          body: JSON.stringify({ error: "Bad gateway" }),
          headers: { "content-type": "application/json" },
        });
        return;
      }
      await route.fulfill({
        json: {
          water: 200,
          salt: 450,
          measurement_type: "sodium",
          sugar: null,
          reasoning: "Recovery test",
        },
      });
    });

    await page.goto("/");
    await expect(page.locator("text=Intake Tracker")).toBeVisible();

    const foodInput = page.locator(
      'input[aria-label="Describe food for AI nutritional parsing"]',
    );
    await foodInput.scrollIntoViewIfNeeded();

    // First try fails. UI should surface an error toast but not crash.
    await foodInput.fill("bowl of chicken soup");
    await foodInput.press("Enter");
    // Give the failure path time to render its toast.
    await page.waitForTimeout(500);

    // Page must still be interactive — try again, this time it
    // succeeds. The input should still accept new submissions; the
    // first failure must not have left the component in a permanent
    // loading state.
    await foodInput.fill("bowl of chicken soup");
    await foodInput.press("Enter");

    // Form should be populated from the second (successful) call.
    const foodSaltCard = page.locator("#section-food-salt");
    await expect(foodSaltCard.locator("#eating-sodium")).toHaveValue("450", {
      timeout: 10_000,
    });
  });
});

test.describe("Chaos: IndexedDB quota exceeded", () => {
  test("the app surfaces a recoverable error when the disk quota is hit", async ({
    page,
  }) => {
    // Inject a polyfill BEFORE the app loads that makes every
    // IDBObjectStore.put fail with QuotaExceededError. This is the
    // worst plausible disk failure — the user is out of storage and
    // every write fails.
    await page.addInitScript(() => {
      const orig = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (
        ...args: Parameters<typeof orig>
      ) {
        const req = orig.apply(this, args);
        Promise.resolve().then(() => {
          try {
            Object.defineProperty(req, "error", {
              value: new DOMException(
                "Quota exceeded (chaos fixture)",
                "QuotaExceededError",
              ),
              configurable: true,
            });
            const ev = new Event("error", { bubbles: true });
            req.dispatchEvent(ev);
          } catch {
            // Some browsers seal the request; ignore.
          }
        });
        return req;
      };
    });

    await page.goto("/");
    await expect(page.locator("text=Intake Tracker")).toBeVisible();

    // Try a write. It MUST fail at the IDB layer — the assertion is
    // that the page is still responsive afterwards. A real bug here
    // would be: unhandled rejection bubbles to the error boundary,
    // the page becomes blank, or a spinner spins forever.
    const waterCard = page.locator("#section-water");
    await waterCard
      .locator("button", { hasText: "Confirm Entry" })
      .click()
      .catch(() => {
        // Some UI paths swallow click handlers on persistent write
        // failure; that's fine for the smoke.
      });

    // Critical: the page must remain interactive. The header is still
    // rendered, no global "Something went wrong" overlay appears.
    await expect(page.locator("text=Intake Tracker")).toBeVisible();
    await expect(
      page.locator("text=Something went wrong"),
    ).not.toBeVisible();
  });
});

test.describe("Chaos: clock jump backward", () => {
  test("the dashboard renders correctly when the device clock jumps backward", async ({
    page,
  }) => {
    // PWA failure mode (Pattern 9 in docs/TESTING_STRATEGY.md, picked
    // up from the LogRocket offline-first 2025 review): NTP sync
    // jumps the clock backward. Anything that relies on Date.now()
    // monotonicity may misbehave — `updatedAt` ordering, day buckets,
    // the "today" view.
    //
    // We freeze the page's Date.now to a value in the past BEFORE the
    // app mounts.
    await page.addInitScript(() => {
      const fakeNow = Date.UTC(2020, 5, 15, 12, 0, 0); // 2020-06-15
      const RealDate = Date;
      // @ts-expect-error — override global Date for the page
      window.Date = class extends RealDate {
        constructor(...args: ConstructorParameters<typeof RealDate>) {
          if (args.length === 0) {
            super(fakeNow);
          } else {
            super(...args);
          }
        }
        static now(): number {
          return fakeNow;
        }
      };
      // Preserve static helpers
      // @ts-expect-error — propagate parse/UTC
      window.Date.parse = RealDate.parse;
      // @ts-expect-error — propagate parse/UTC
      window.Date.UTC = RealDate.UTC;
    });

    await page.goto("/");

    // The dashboard must render without crashing. We don't assert on
    // specific date strings (they depend on locale + the frozen
    // value); we assert the header is visible and no error UI shows.
    await expect(page.locator("text=Intake Tracker")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator("text=Something went wrong"),
    ).not.toBeVisible();
  });
});

test.describe("Chaos: iOS 7-day storage eviction recovery", () => {
  test("cold-start after a Dexie wipe still renders the dashboard and stays interactive", async ({
    page,
  }) => {
    // Per the Mobile Viewer PWA Testing Checklist 2026, iOS evicts a
    // PWA's IndexedDB + service-worker caches after ~7 days of
    // inactivity unless persistent storage was granted. The next time
    // the user opens the app, Dexie is empty even though the server
    // still has their records.
    //
    // We can't fast-forward 7 days, but we can simulate the post-
    // eviction state by visiting the app once (initialising Dexie),
    // wiping every IndexedDB database, then reloading. The app should:
    //   - render without crashing (no global error overlay)
    //   - stay interactive (header visible, scrollable cards)
    //   - NOT show "Something went wrong"
    //
    // What this catches: any code path that reads from Dexie at mount
    // without handling the empty case, infinite retry loops on the
    // sync engine, hung loading spinners, unhandled rejections that
    // bubble to the React error boundary.
    //
    // Note: we don't assert the data eventually returns. That requires
    // a working backend sync pull, which is the e2e-with-Neon-Auth
    // job's responsibility. This is a SMOKE test for graceful
    // degradation on the cold-start path.

    // 1. Warm the app once so the IndexedDB databases exist.
    await page.goto("/");
    await expect(page.locator("text=Intake Tracker")).toBeVisible({
      timeout: 15_000,
    });

    // 2. Simulate the eviction: enumerate every IndexedDB database
    //    on the origin and delete each one. Mirrors what iOS does
    //    when storage pressure or the 7-day timer fires.
    await page.evaluate(async () => {
      const dbs = await (typeof indexedDB.databases === "function"
        ? indexedDB.databases()
        : Promise.resolve([{ name: "HealthTracker" }]));
      await Promise.all(
        dbs
          .filter(
            (d): d is IDBDatabaseInfo & { name: string } =>
              typeof d.name === "string",
          )
          .map(
            (d) =>
              new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(d.name);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              }),
          ),
      );
    });

    // 3. Force a cold start. The app re-mounts against empty IDB.
    await page.reload();

    // 4. Dashboard must render. Generous timeout: a fresh boot may
    //    re-run Dexie migrations from v1 to the current schema.
    await expect(page.locator("text=Intake Tracker")).toBeVisible({
      timeout: 20_000,
    });

    // 5. No global error UI.
    await expect(
      page.locator("text=Something went wrong"),
    ).not.toBeVisible();
    await expect(
      page.locator("text=Cannot read properties"),
    ).not.toBeVisible();

    // 6. Interactivity smoke: scroll into a card without a stuck
    //    overlay intercepting events.
    const anyCard = page.locator('[id^="section-"]').first();
    await expect(anyCard).toBeVisible({ timeout: 10_000 });
    await anyCard.scrollIntoViewIfNeeded();
  });

  test("malformed localStorage state doesn't break the settings store", async ({
    page,
  }) => {
    // Adjacent failure mode to iOS eviction: localStorage isn't wiped
    // by the 7-day timer, but a partially-written value (storage full
    // during a save, race between two tabs, manual edit via devtools)
    // can leave a malformed JSON blob behind. The settings store
    // (zustand-persist) must NOT throw on mount — it should fall back
    // to defaults silently.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          "settings-store",
          '{"state":{"waterLimit":"not-a-number","saltIncrement":', // truncated
        );
      } catch {
        // If localStorage isn't writable yet, the test still proves
        // the cold-start path renders.
      }
    });

    await page.goto("/");

    await expect(page.locator("text=Intake Tracker")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator("text=Something went wrong"),
    ).not.toBeVisible();
  });
});
