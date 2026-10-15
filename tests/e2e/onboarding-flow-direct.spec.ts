import { test, expect } from '@playwright/test';
import { AuthMocker } from './auth-utils';

test.describe('Direct Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthMocker(page);
    await auth.mockImmediateAuth({ email: 'test@example.com', fullName: 'Test User' });
    await page.goto('/onboarding');
    await page.getByRole('button', { name: /dismiss update/i }).click({ timeout: 2000 }).catch(() => undefined);
  });

  test('completes one-screen onboarding', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /what is your business called/i })).toBeVisible();
    await page.getByTestId('onboarding-business-name').fill('North Shore Studio');
    await expect(page.getByTestId('onboarding-submit')).toBeEnabled();
    await page.getByTestId('onboarding-country').selectOption('Australia');
    await expect(page.getByText(/default tax rate set to 10%/i)).toBeVisible();
    await page.getByTestId('onboarding-submit').click();
    await expect(page).not.toHaveURL(/\/onboarding/);
  });

  test('stays on onboarding when name is empty', async ({ page }) => {
    await expect(page.getByTestId('onboarding-submit')).toBeDisabled();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('works on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('onboarding-business-name').fill('Mobile Studio');
    await expect(page.getByTestId('onboarding-submit')).toBeEnabled();
    await page.getByTestId('onboarding-submit').click();
    await expect(page).not.toHaveURL(/\/onboarding/);
  });
});
