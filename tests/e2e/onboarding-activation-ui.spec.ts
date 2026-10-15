import { test, expect } from '@playwright/test';
import { AuthMocker } from './auth-utils';

async function dismissUpdate(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /dismiss update/i }).click({ timeout: 2000 }).catch(() => undefined);
}

async function stubEmptyLists(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/invoices**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/rest/v1/expenses**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/rest/v1/customers**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
      return;
    }
    await route.continue();
  });
}

test.describe('Onboarding activation UI', () => {
  test('skip lands on dashboard empty CTA then create invoice', async ({ page }) => {
    const auth = new AuthMocker(page);
    await auth.mockImmediateAuth({ email: 'skip-ui@example.com', fullName: 'Skip UI' });
    await stubEmptyLists(page);
    await page.goto('/onboarding');
    await dismissUpdate(page);
    await page.getByTestId('onboarding-skip').click();
    await expect(page).not.toHaveURL(/\/onboarding/);
    await expect(page.getByTestId('dashboard-empty-create-invoice')).toBeVisible();
    await page.getByTestId('dashboard-empty-create-invoice').click();
    await expect(page).toHaveURL(/\/invoices\/new/);
  });

  test('dashboard empty CTA works on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const auth = new AuthMocker(page);
    await auth.mockImmediateAuth({ email: 'mobile-ui@example.com', fullName: 'Mobile UI' });
    await stubEmptyLists(page);
    await page.goto('/onboarding');
    await dismissUpdate(page);
    await page.getByTestId('onboarding-business-name').fill('Harbour Cafe');
    await page.getByTestId('onboarding-submit').click();
    await expect(page).not.toHaveURL(/\/onboarding/);
    await expect(page.getByTestId('dashboard-empty-create-invoice')).toBeVisible();
  });

});
