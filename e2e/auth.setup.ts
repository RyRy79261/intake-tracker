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

  // 2. Privy modal opens — enter test email
  const dialog = page.locator('#privy-dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  const emailInput = dialog.locator('input[type="email"]');
  await emailInput.fill(testEmail);
  await dialog.getByRole('button', { name: /submit|continue|log in/i }).click();

  // 3. Enter OTP code — Privy renders individual digit inputs
  const otpInputs = dialog.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[data-index]');
  const otpCount = await otpInputs.count();
  if (otpCount > 1) {
    // Individual digit inputs
    for (let i = 0; i < otpCount && i < testOtp.length; i++) {
      await otpInputs.nth(i).fill(testOtp[i]);
    }
  } else if (otpCount === 1) {
    // Single OTP input
    await otpInputs.first().fill(testOtp);
  } else {
    // Fallback: type into the focused element
    await page.keyboard.type(testOtp);
  }

  // 4. Wait for auth to complete — dashboard should appear
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 30000 });

  // Save authenticated state for all other tests
  await page.context().storageState({ path: authFile });
});
