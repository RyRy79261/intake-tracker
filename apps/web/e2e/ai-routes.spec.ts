import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * AI routes through the UI: one success path per main flow and the error
 * paths per route family, with every /api/ai/* response mocked (no real AI
 * calls). The bodies follow the AI task module's error table
 * (app/api/ai/_shared/ai-task.ts):
 *   422 + fallbackToManual — the AI answered, the answer can't be used:
 *       AI_REFUSED, SEARCH_REQUIRED;
 *   502 — the call went wrong, try again: AI_BAD_OUTPUT, AI_FAILED, or a
 *       platform error page with no JSON at all;
 *   402 NO_AI_KEY — the route's message says where to add a key.
 */

/** The AI controls only show when signed in: fake a Neon Auth session. */
async function signIn(page: Page) {
  const now = new Date();
  await page.route('**/api/auth/get-session**', (route) =>
    route.fulfill({
      json: {
        session: {
          id: 'e2e-session',
          userId: 'e2e-user',
          token: 'e2e',
          expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        user: {
          id: 'e2e-user',
          email: 'e2e@example.test',
          name: 'E2E',
          emailVerified: true,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      },
    }),
  );
  // A fake session must not reach the real sync or key endpoints.
  await page.route('**/api/sync/**', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/user/**', (route) => route.fulfill({ json: {} }));
}

const json = (status: number, body: unknown) => (route: Route) =>
  route.fulfill({ status, json: body });

const REFUSED = {
  error: 'The AI declined to answer this request. Enter the details manually.',
  code: 'AI_REFUSED',
  fallbackToManual: true,
};
const BAD_OUTPUT = {
  error: 'The AI answer could not be read. Try again.',
  code: 'AI_BAD_OUTPUT',
  fallbackToManual: true,
};
const NO_KEY = {
  error: 'No anthropic API key configured. Add one in Settings → AI features.',
  code: 'NO_AI_KEY',
  provider: 'anthropic',
};
const platform502 = (route: Route) =>
  route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' });

async function expectNoCrash(page: Page) {
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
}

test.describe('Food parse (/api/ai/parse)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  async function parse(page: Page, text: string) {
    await page.goto('/');
    const input = page.getByLabel('Describe food for AI nutritional parsing');
    await input.scrollIntoViewIfNeeded();
    await input.fill(text);
    await input.press('Enter');
  }

  test('a parsed meal fills the Food card and records', async ({ page }) => {
    let body: unknown;
    await page.route('**/api/ai/parse', (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({
        json: {
          water: 200,
          salt: 450,
          measurement_type: 'sodium',
          sugar: 3,
          potassium: 300,
          is_drink: false,
          caffeine_mg: null,
          abv_percent: null,
          reasoning: 'A bowl of soup.',
        },
      });
    });
    await parse(page, 'bowl of chicken soup');

    const food = page.locator('#section-food-salt');
    await expect(food.locator('#eating-sodium')).toHaveValue('450');
    await expect(food.locator('#eating-water')).toHaveValue('200');
    expect(body).toEqual({ input: 'bowl of chicken soup' });
    await food.getByRole('button', { name: 'Record with details' }).click();
    await expect(page.getByText('Meal with details recorded', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  for (const [name, handler] of [
    ['422 AI_REFUSED', json(422, REFUSED)],
    ['502 AI_BAD_OUTPUT', json(502, BAD_OUTPUT)],
    ['a 502 error page', platform502],
  ] as const) {
    test(`${name}: says so and the meal can still be entered by hand`, async ({ page }) => {
      await page.route('**/api/ai/parse', handler);
      await parse(page, 'mystery stew');

      await expect(page.getByText('AI parsing failed', { exact: true }).first()).toBeVisible();
      await expectNoCrash(page);

      // Fallback to manual: the same card records a hand-entered amount.
      const food = page.locator('#section-food-salt');
      await food.locator('#eating-sodium').fill('300');
      await food.getByRole('button', { name: 'Record with details' }).click();
      await expect(page.getByText('Meal with details recorded', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    });
  }
});

test.describe('Substance lookup (/api/ai/substance-lookup)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  async function lookUp(page: Page) {
    await page.goto('/');
    const coffee = page.getByRole('tab', { name: 'Coffee', exact: true });
    await coffee.scrollIntoViewIfNeeded();
    await coffee.click();
    const panel = page.locator('[role="tabpanel"][data-state="active"]');
    await panel.getByLabel('Search beverages for AI lookup').fill('double espresso');
    await panel.getByLabel('Look up substance content').click();
    return panel;
  }

  test('a found drink fills the coffee form', async ({ page }) => {
    let body: unknown;
    await page.route('**/api/ai/substance-lookup', (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({
        json: {
          substancePer100ml: 212,
          defaultVolumeMl: 60,
          beverageName: 'Double espresso',
          reasoning: 'Mocked.',
          sugarPer100ml: 0,
          sodiumPer100ml: 1,
        },
      });
    });
    const panel = await lookUp(page);

    await expect(panel.getByLabel('coffee name')).toHaveValue('Double espresso');
    expect(body).toEqual({ query: 'double espresso', type: 'caffeine' });
  });

  test('402 NO_AI_KEY shows where to add a key', async ({ page }) => {
    await page.route('**/api/ai/substance-lookup', json(402, NO_KEY));
    await lookUp(page);
    await expect(page.getByText('Lookup failed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Add one in Settings → AI features/).first()).toBeVisible();
  });

  test('422 SEARCH_REQUIRED says to retry or enter the value by hand', async ({ page }) => {
    await page.route(
      '**/api/ai/substance-lookup',
      json(422, {
        error: 'Could not verify the caffeine content against a source. Try again, or enter the value manually.',
        code: 'SEARCH_REQUIRED',
        fallbackToManual: true,
      }),
    );
    const panel = await lookUp(page);
    await expect(page.getByText(/enter the value manually/).first()).toBeVisible();
    // Nothing was filled in from the rejected answer.
    await expect(panel.getByLabel('coffee name')).toHaveValue('');
  });

  test('a 502 error page fails cleanly', async ({ page }) => {
    await page.route('**/api/ai/substance-lookup', platform502);
    await lookUp(page);
    await expect(page.getByText('Lookup failed', { exact: true }).first()).toBeVisible();
    await expectNoCrash(page);
  });
});

test.describe('Medicine search (/api/ai/medicine-search)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  async function search(page: Page) {
    await page.goto('/medications');
    await page.getByRole('button', { name: 'Add a prescription' }).click();
    await page.getByLabel('Medicine name or brand').fill('Aviolix 75mg');
    await page.keyboard.press('Enter');
  }

  test('a found medicine can be applied to the form', async ({ page }) => {
    await page.route('**/api/ai/medicine-search', (route) =>
      route.fulfill({
        json: {
          brandNames: ['Aviolix'],
          localAlternatives: [],
          genericName: 'Aviolix Compound',
          dosageStrengths: ['75mg'],
          activeIngredients: [],
          strengthOptions: [],
          commonIndications: ['Testing'],
          foodInstruction: 'after',
          pillColor: 'purple',
          pillShape: 'round',
          pillDescription: 'A purple reddish round pill',
          drugClass: 'Test Class',
          contraindications: [],
          warnings: [],
          isGenericFallback: false,
          appearanceVerified: true,
        },
      }),
    );
    await search(page);
    await expect(page.getByText('Found: Aviolix Compound').first()).toBeVisible();
    await page.getByRole('button', { name: 'Apply to form' }).click();
    await expect(page.getByPlaceholder('e.g. Aviolix', { exact: true })).toHaveValue('Aviolix 75');
  });

  test('422 AI_REFUSED shows the route message (enter it manually)', async ({ page }) => {
    await page.route('**/api/ai/medicine-search', json(422, REFUSED));
    await search(page);
    await expect(page.getByText(REFUSED.error).first()).toBeVisible();
  });

  test('502 AI_BAD_OUTPUT says the service did not answer and points to the form', async ({ page }) => {
    await page.route('**/api/ai/medicine-search', json(502, BAD_OUTPUT));
    await search(page);
    await expect(
      page.getByText('The AI service did not answer. Try again later, or enter the details from the box.'),
    ).toBeVisible();
    // The details can still be typed in.
    await expect(page.getByPlaceholder('e.g. Aviolix', { exact: true })).toBeEditable();
  });
});

test.describe('Analytics insights (/api/analytics/insights)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  /** The snapshot is built from IndexedDB first, which is slow under load. */
  const SLOW = { timeout: 15_000 };

  /**
   * Log a glass of water at noon one day, then ask for a fast summary at
   * noon the next (insights cover whole days before today). Fixed dates at
   * noon keep both clear of midnight and of the day-start hour.
   */
  async function generate(page: Page, mock: (route: Route) => unknown): Promise<Page> {
    await page.clock.install({ time: new Date('2026-10-14T12:00:00') });
    await page.route('**/api/analytics/insights', mock);
    await page.goto('/');
    await page.getByRole('button', { name: 'Confirm Entry' }).first().click();
    await expect(page.getByRole('button', { name: /^Water today 250 of/ })).toBeVisible();

    // Next day, and hold the clock there: no timer runs, so an error toast
    // stays up until it is read (its auto-dismiss is a timer).
    await page.clock.setSystemTime(new Date('2026-10-15T12:00:00'));
    await page.clock.pauseAt(new Date('2026-10-15T12:00:01'));
    await page.goto('/analytics');
    // First visit: the analytics intro dialog.
    const intro = page.getByRole('dialog').filter({ hasText: 'Your analytics' });
    await intro.getByRole('button', { name: 'Got it' }).click();
    await expect(intro).toBeHidden();
    await page.getByRole('button', { name: 'Fast analysis' }).click();
    const generateButton = page.getByRole('dialog').getByRole('button', { name: 'Generate insights' });
    await expect(generateButton).toBeEnabled();
    // Let the dialog's open animation finish: a click mid-animation can land
    // on the overlay and close the dialog instead.
    await generateButton.evaluate((el) =>
      Promise.all(
        (el.closest('[role=dialog]')?.getAnimations({ subtree: true }) ?? []).map((a) => a.finished),
      ),
    );
    await generateButton.click({ force: true });
    return page;
  }

  test('a generated summary is shown', async ({ page }) => {
    let body: { metrics?: unknown } | undefined;
    const today = await generate(page, (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({
        json: {
          narrative: 'Your water intake was steady this week.',
          observations: ['Water was logged on one day.'],
          generatedAt: Date.now(),
        },
      });
    });
    // Showing the report waits on timers: let the clock run again.
    await today.clock.resume();
    await expect(today.getByText('Your water intake was steady this week.').first()).toBeVisible(SLOW);
    expect(body?.metrics).toBeTruthy();
  });

  test('502 AI_BAD_OUTPUT says it could not generate insights', async ({ page }) => {
    const today = await generate(page, json(502, BAD_OUTPUT));
    await expect(today.getByText("Couldn't generate insights", { exact: true }).first()).toBeVisible(SLOW);
    await expect(today.getByText(BAD_OUTPUT.error).first()).toBeVisible();
  });

  test('422 AI_REFUSED shows the route message', async ({ page }) => {
    const today = await generate(
      page,
      json(422, { error: 'The AI declined to summarise this data.', code: 'AI_REFUSED' }),
    );
    await expect(today.getByText('The AI declined to summarise this data.').first()).toBeVisible(SLOW);
  });
});

test.describe('Medicine search time limit', () => {
  // #415 gave the lookup a 120 s deadline inside a 130 s function, but the
  // panel still stopped waiting at 95 s, so a slow lookup the server would
  // have answered showed "took too long".
  test('waits past 95 s for a slow lookup and shows its answer', async ({ page }) => {
    await signIn(page);
    await page.clock.install();
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    await page.route('**/api/ai/medicine-search', async (route) => {
      requested = true;
      await released;
      await route.fulfill({
        json: {
          brandNames: ['Aviolix'],
          localAlternatives: [],
          genericName: 'Aviolix Compound',
          dosageStrengths: ['75mg'],
          activeIngredients: [],
          strengthOptions: [],
          commonIndications: ['Testing'],
          foodInstruction: 'after',
          pillColor: 'purple',
          pillShape: 'round',
          pillDescription: 'A purple reddish round pill',
          drugClass: 'Test Class',
          contraindications: [],
          warnings: [],
          isGenericFallback: false,
          appearanceVerified: true,
        },
      });
    });

    await page.goto('/medications');
    await page.getByRole('button', { name: 'Add a prescription' }).click();
    await page.getByLabel('Medicine name or brand').fill('Aviolix 75mg');
    await page.keyboard.press('Enter');
    await expect.poll(() => requested).toBe(true);

    // 110 s: past the old 95 s stop, inside the route's 130 s limit.
    await page.clock.runFor(110_000);
    await expect(page.getByText(/took too long/)).toHaveCount(0);

    release();
    await expect(page.getByText('Found: Aviolix Compound')).toBeVisible();
  });
});
