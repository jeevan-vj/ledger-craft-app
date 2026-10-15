import { test, expect } from '@playwright/test';
import { AuthMocker } from './auth-utils';

test.describe('Onboarding activation', () => {
  test('invoice list empty CTA goes to create invoice', async ({ page }) => {
    const auth = new AuthMocker(page);
    await auth.mockCompletedOnboarding({ email: 'ready@example.com', fullName: 'Ready User' });
    await page.goto('/invoices');
    await page.getByTestId('empty-create-invoice').click();
    await expect(page).toHaveURL(/\/invoices\/new/);
  });

  test('skip path leaves onboarding', async ({ page }) => {
    const auth = new AuthMocker(page);
    await auth.mockImmediateAuth({ email: 'skip@example.com', fullName: 'Skip User' });
    await page.goto('/onboarding');
    await page.getByTestId('onboarding-skip').click();
    await expect(page).not.toHaveURL(/\/onboarding/);
  });
});
