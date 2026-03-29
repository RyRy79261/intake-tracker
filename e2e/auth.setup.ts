import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup('authenticate via Privy test account', async ({ page }) => {
  // Navigate to the app — AuthGuard will show login prompt
  await page.goto('/');

  // Click the "Sign In" button rendered by AuthGuard
  await page.locator('button', { hasText: 'Sign In' }).click();

  // Privy opens a modal dialog (iframe from auth.privy.io)
  // Wait for the Privy iframe to appear and interact with it
  const privyFrame = page.frameLocator('iframe[title*="privy"], iframe[src*="auth.privy.io"]');

  // Enter test email
  const emailInput = privyFrame.getByRole('textbox');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(process.env.PRIVY_TEST_EMAIL ?? '');
  await emailInput.press('Enter');

  // Enter test OTP (Privy test accounts have a fixed OTP)
  // Wait for OTP input fields to appear
  const otpInput = privyFrame.locator('input[type="text"], input[autocomplete="one-time-code"]').first();
  await otpInput.waitFor({ state: 'visible', timeout: 10000 });

  // Privy OTP is typically 6 individual digit inputs — type the full OTP
  const otp = process.env.PRIVY_TEST_OTP ?? '';
  await privyFrame.locator('input').first().focus();
  await page.keyboard.type(otp);

  // Wait for authentication to complete — the dashboard should load
  await expect(page.locator('text=Intake Tracker')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#section-water')).toBeVisible({ timeout: 5000 });

  // Save authenticated state
  await page.context().storageState({ path: authFile });
});
