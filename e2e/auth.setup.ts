import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup('authenticate via Privy test account', async ({ page }) => {
  const testEmail = process.env.PRIVY_TEST_EMAIL;
  const testOtp = process.env.PRIVY_TEST_OTP;

  if (!testEmail || !testOtp) {
    throw new Error(
      'Missing PRIVY_TEST_EMAIL or PRIVY_TEST_OTP env vars. ' +
      'Set them in .env.local (local) or GitHub secrets (CI).'
    );
  }

  // 1. Navigate to app — AuthGuard shows "Sign In" button
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).click();

  // 2. Privy modal opens — wait for the email input inside the dialog
  //    (the dialog container uses CSS transitions that Playwright sees as "hidden")
  const emailInput = page.locator('#privy-modal-content input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(testEmail);
  await emailInput.press('Enter');

  // 3. Enter OTP code — type digits into the focused input
  //    Wait for the OTP screen to appear
  await page.locator('#privy-modal-content input').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.keyboard.type(testOtp);

  // 4. Wait for auth to complete — dashboard should appear
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30000 });

  // Save authenticated state for all other tests
  await page.context().storageState({ path: authFile });
});
