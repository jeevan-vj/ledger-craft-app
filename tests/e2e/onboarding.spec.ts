import { test, expect } from '@playwright/test';
import { AuthMocker } from './auth-utils';

test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthMocker(page);
    await auth.mockImmediateAuth({ email: 'test@example.com', fullName: 'Test User' });
    await page.goto('/onboarding');
    await page.getByRole('button', { name: /dismiss update/i }).click({ timeout: 2000 }).catch(() => undefined);
  });

  test('shows name and country only', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /what is your business called/i })).toBeVisible();
    await expect(page.getByTestId('onboarding-business-name')).toBeVisible();
    await expect(page.getByTestId('onboarding-country')).toBeVisible();
    await expect(page.getByTestId('onboarding-email-hint')).toContainText('test@example.com');
    await expect(page.getByPlaceholder(/business email/i)).toHaveCount(0);
    await expect(page.getByText(/invoice number format/i)).toHaveCount(0);
    await expect(page.getByText(/upload logo/i)).toHaveCount(0);
    await expect(page.getByTestId('onboarding-submit')).toBeVisible();
    await expect(page.getByTestId('onboarding-skip')).toBeVisible();
  });

  test('blocks submit without a business name', async ({ page }) => {
    await expect(page.getByTestId('onboarding-submit')).toBeDisabled();
    await page.getByTestId('onboarding-submit').click({ force: true }).catch(() => undefined);
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('completes setup and leaves onboarding', async ({ page }) => {
    await page.getByTestId('onboarding-business-name').fill('North Shore Studio');
    await expect(page.getByTestId('onboarding-submit')).toBeEnabled();
    await page.getByTestId('onboarding-submit').click();
    await expect(page).not.toHaveURL(/\/onboarding/);
  });

  test('skip creates a stub profile and leaves onboarding', async ({ page }) => {
    await page.getByTestId('onboarding-skip').click();
    await expect(page).not.toHaveURL(/\/onboarding/);
  });
});
