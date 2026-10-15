import { test, expect } from '@playwright/test';
import { AuthMocker } from './auth-utils';

const testUser = {
  fullName: 'Alex Rivera',
  email: `test+${Date.now()}@example.com`,
  password: 'SecurePass123',
};

test.describe('Signup to onboarding', () => {
  test('signup without confirm password reaches one-screen onboarding', async ({ page }) => {
    const auth = new AuthMocker(page);
    await auth.mockImmediateAuth({
      email: testUser.email,
      fullName: testUser.fullName,
    });

    await page.goto('/signup');
    await page.locator('input[name="fullName"]').fill(testUser.fullName);
    await page.locator('input[name="email"]').fill(testUser.email);
    await page.locator('input[name="password"]').fill(testUser.password);
    await expect(page.locator('input[name="confirmPassword"]')).toHaveCount(0);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading', { name: /what is your business called/i })).toBeVisible();
  });

  test('completing onboarding shows dashboard create CTA', async ({ page }) => {
    const auth = new AuthMocker(page);
    await auth.mockImmediateAuth({
      email: testUser.email,
      fullName: testUser.fullName,
    });
    await page.goto('/onboarding');
    await page.getByTestId('onboarding-business-name').fill('Rivera Design');
    await expect(page.getByTestId('onboarding-submit')).toBeEnabled();
    await page.getByTestId('onboarding-submit').click();
    await expect(page).not.toHaveURL(/\/onboarding/);
    await page.goto('/invoices');
    await page.getByRole('button', { name: /dismiss update/i }).click({ timeout: 2000 }).catch(() => undefined);
    await expect(page.getByTestId('empty-create-invoice')).toBeVisible();
  });
});
