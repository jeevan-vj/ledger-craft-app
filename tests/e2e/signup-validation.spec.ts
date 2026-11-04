import { test, expect } from '@playwright/test';

test.describe('Sign Up Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveTitle(/EasyBizInvoice/);
  });

  test('should have correct placeholder text', async ({ page }) => {
    await expect(page.locator('input[name="fullName"]')).toHaveAttribute('placeholder', 'Enter your full name');
    await expect(page.locator('input[name="email"]')).toHaveAttribute('placeholder', 'Enter your email');
    await expect(page.locator('input[name="password"]')).toHaveAttribute('placeholder', 'At least 8 characters');
    await expect(page.locator('input[name="confirmPassword"]')).toHaveCount(0);
  });

  test.describe('Real-time Field Validation', () => {
    test('should validate full name field on change', async ({ page }) => {
      const nameInput = page.locator('input[name="fullName"]');

      await nameInput.fill('J');
      await expect(page.getByText('Full name must be at least 2 characters')).toBeVisible();

      await nameInput.fill('John Doe');
      await expect(page.getByText('Full name must be at least 2 characters')).not.toBeVisible();
    });

    test('should validate email field on change', async ({ page }) => {
      const emailInput = page.locator('input[name="email"]');
      const invalidEmails = ['invalid', 'invalid@', '@invalid.com', 'invalid@.com', 'invalid.com'];

      for (const email of invalidEmails) {
        await emailInput.fill(email);
        await expect(page.getByText('Invalid email address')).toBeVisible();
      }

      await emailInput.fill('valid@example.com');
      await expect(page.getByText('Invalid email address')).not.toBeVisible();
    });

    test('keeps Create account disabled until the terms are accepted', async ({ page }) => {
      await page.locator('input[name="fullName"]').fill('John Doe');
      await page.locator('input[name="email"]').fill('test@example.com');
      await page.locator('input[name="password"]').fill('password');
      await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled();

      await page.getByRole('checkbox').check();
      await expect(page.getByRole('button', { name: /create account/i })).toBeEnabled();
    });
  });

  test.describe('Form Submission Validation', () => {
    test('should prevent submission with empty required fields', async ({ page }) => {
      const submitButton = page.getByRole('button', { name: /create account/i });
      await expect(submitButton).toBeDisabled();
      await expect(page).toHaveURL(/\/signup/);
    });

    test('should prevent submission with invalid email', async ({ page }) => {
      await page.locator('input[name="fullName"]').fill('John Doe');
      await page.locator('input[name="email"]').fill('invalid-email');
      await page.locator('input[name="password"]').fill('password');
      await page.getByRole('checkbox').check();

      await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled();
      await expect(page.getByText('Invalid email address')).toBeVisible();
      await expect(page).toHaveURL(/\/signup/);
    });

    test('should prevent submission without terms agreement', async ({ page }) => {
      await page.locator('input[name="fullName"]').fill('John Doe');
      await page.locator('input[name="email"]').fill('test@example.com');
      await page.locator('input[name="password"]').fill('password');

      await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled();
      await expect(page).toHaveURL(/\/signup/);
    });
  });

  test.describe('Edge Cases and Special Characters', () => {
    test('should handle special characters in full name', async ({ page }) => {
      const specialNames = [
        "Jean-Pierre O'Connor",
        'María José García',
        '李小明',
        'Müller',
        'José María',
      ];
      const nameInput = page.locator('input[name="fullName"]');

      for (const name of specialNames) {
        await nameInput.fill(name);
        await expect(page.getByText('Full name must be at least 2 characters')).not.toBeVisible();
      }
    });

    test('should handle edge case emails', async ({ page }) => {
      const edgeCaseEmails = [
        'test+tag@example.com',
        'user.name@example.com',
        'user_name@example-domain.com',
        'a@b.co',
        'very.long.email.address@very-long-domain-name.com',
      ];
      const emailInput = page.locator('input[name="email"]');

      for (const email of edgeCaseEmails) {
        await emailInput.fill(email);
        await expect(page.getByText('Invalid email address')).not.toBeVisible();
      }
    });

    test('should handle maximum field lengths', async ({ page }) => {
      const longName = 'A'.repeat(100);
      const longEmail = `${'a'.repeat(50)}@${'b'.repeat(50)}.com`;
      const longPassword = `password${'x'.repeat(100)}`;

      await page.locator('input[name="fullName"]').fill(longName);
      await page.locator('input[name="email"]').fill(longEmail);
      await page.locator('input[name="password"]').fill(longPassword);

      await expect(page.locator('input[name="fullName"]')).toHaveValue(longName);
      await expect(page.locator('input[name="email"]')).toHaveValue(longEmail);
      await expect(page.locator('input[name="password"]')).toHaveValue(longPassword);
    });
  });

  test.describe('Password Security Requirements', () => {
    test('should enforce minimum password length', async ({ page }) => {
      const passwordInput = page.locator('input[name="password"]');

      for (const password of ['1', '12', '123', '1234567']) {
        await passwordInput.fill(password);
        await expect(page.getByText('Use at least 8 characters.', { exact: true })).toBeVisible();
      }

      await passwordInput.fill('12345678');
      await expect(page.getByText('Use at least 8 characters.', { exact: true })).not.toBeVisible();
    });

    test('accepts an 8 character password without extra complexity rules', async ({ page }) => {
      const passwordInput = page.locator('input[name="password"]');
      await passwordInput.fill('password');
      await expect(page.getByText('Use at least 8 characters.', { exact: true })).not.toBeVisible();
      await expect(page.getByText('Password must contain uppercase, lowercase, and number')).toHaveCount(0);
    });
  });

  test.describe('Accessibility and User Experience', () => {
    test('should maintain focus management', async ({ page }) => {
      await page.keyboard.press('Tab');
      await expect(page.locator('input[name="fullName"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('input[name="email"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('input[name="password"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.getByRole('checkbox')).toBeFocused();
    });

    test('should provide proper error announcements', async ({ page }) => {
      await page.locator('input[name="fullName"]').fill('J');
      await page.locator('input[name="email"]').fill('invalid');

      await expect(page.getByText('Full name must be at least 2 characters')).toHaveAttribute('role', 'alert');
      await expect(page.getByText('Invalid email address')).toHaveAttribute('role', 'alert');
    });

    test('should clear validation errors when field becomes valid', async ({ page }) => {
      const nameInput = page.locator('input[name="fullName"]');
      await nameInput.fill('J');
      await expect(page.getByText('Full name must be at least 2 characters')).toBeVisible();

      await nameInput.fill('John Doe');
      await expect(page.getByText('Full name must be at least 2 characters')).not.toBeVisible();
    });
  });
});
