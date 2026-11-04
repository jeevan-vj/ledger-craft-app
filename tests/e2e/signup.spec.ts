import { test, expect } from '@playwright/test';

// Test data
const validUser = {
  fullName: 'John Doe',
  email: `test+${Date.now()}@example.com`, // Unique email for each test run
  password: 'SecurePass123',
};

const invalidPasswords = [
  { password: 'weak', error: 'Use at least 8 characters.' },
];

test.describe('Sign Up Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveTitle(/EasyBizInvoice/);
  });

  test('should display sign-up form with all required fields', async ({ page }) => {
    // Check page title and heading
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    
    // Check all form fields are present using input attributes
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toHaveCount(0);
    
    // Verify placeholders - first field is autofocused so has empty placeholder, others show placeholders
    await expect(page.locator('input[name="fullName"]')).toHaveAttribute('placeholder', 'Enter your full name');
    await expect(page.locator('input[name="email"]')).toHaveAttribute('placeholder', 'Enter your email');
    await expect(page.locator('input[name="password"]')).toHaveAttribute('placeholder', 'At least 8 characters');
    
    // Check terms checkbox
    await expect(page.getByRole('checkbox')).toBeVisible();
    
    // Check submit button
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
    
    // Check navigation links
    await expect(page.getByRole('link', { name: /sign in instead/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /terms of service/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /privacy policy/i })).toBeVisible();
  });

  test('should display correct placeholders and floating labels', async ({ page }) => {
    // Test that inputs can be found by name when placeholders are dynamic
    const nameInput = page.locator('input[name="fullName"]');
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    
    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toHaveCount(0);
    
    // Test initial placeholder behavior - first field is autofocused so placeholder is empty
    await expect(nameInput).toHaveAttribute('placeholder', 'Enter your full name');
    await expect(emailInput).toHaveAttribute('placeholder', 'Enter your email');
    await expect(passwordInput).toHaveAttribute('placeholder', 'At least 8 characters');
    
    await nameInput.focus();
    await expect(nameInput).toHaveAttribute('placeholder', 'Enter your full name');
    
    // Test that floating label works and placeholder returns when unfocused without value
    await nameInput.blur();
    await expect(nameInput).toHaveAttribute('placeholder', 'Enter your full name');
    
    // Test typing behavior
    await nameInput.focus();
    await nameInput.fill('John Doe');
    await expect(nameInput).toHaveValue('John Doe');
    
    await nameInput.blur();
    await expect(nameInput).toHaveValue('John Doe');
    await expect(nameInput).toHaveAttribute('placeholder', 'Enter your full name');
  });

  test('explains the shared 8 character password rule', async ({ page }) => {
    await expect(page.getByText('Same rule as the mobile app: 8 or more characters.')).toBeVisible();
    await expect(page.locator('.password-strength, [data-testid="password-strength"]')).toHaveCount(0);
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"]');
    const toggleButton = page.getByRole('button', { name: /show password/i }).first();
    
    // Initially password should be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Click toggle button
    await toggleButton.click();
    
    // Password should now be visible
    await expect(passwordInput).toHaveAttribute('type', 'text');
    
    // Button text should change
    await expect(page.getByRole('button', { name: /hide password/i }).first()).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /create account/i });
    
    // Submit button should be disabled initially with empty form
    await expect(submitButton).toBeDisabled();
    
    // Type invalid values so onChange validation runs
    await page.locator('input[name="fullName"]').fill('J');
    await page.locator('input[name="email"]').fill('not-an-email');
    await page.locator('input[name="password"]').fill('short');
    
    await expect(page.getByText('Full name must be at least 2 characters')).toBeVisible();
    await expect(page.getByText('Invalid email address')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters.', { exact: true })).toBeVisible();
    
    // Submit button should still be disabled
    await expect(submitButton).toBeDisabled();
  });

  test.describe('Password Validation', () => {
    invalidPasswords.forEach(({ password, error }) => {
      test(`should reject weak password: "${password}"`, async ({ page }) => {
        // Fill form with invalid password
        await page.locator('input[name="fullName"]').fill(validUser.fullName);
        await page.locator('input[name="email"]').fill(validUser.email);
        await page.locator('input[name="password"]').fill(password);
        
        await expect(page.getByText(error, { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled();
      });
    });
  });

  test('should validate email format', async ({ page }) => {
    // Fill form with invalid email
    await page.locator('input[name="fullName"]').fill(validUser.fullName);
    await page.locator('input[name="email"]').fill('invalid-email');
    await page.locator('input[name="password"]').fill(validUser.password);
    await page.getByRole('checkbox').check();
    
    await expect(page.getByText('Invalid email address')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  test('should require terms agreement', async ({ page }) => {
    // Fill all fields except terms checkbox
    await page.locator('input[name="fullName"]').fill(validUser.fullName);
    await page.locator('input[name="email"]').fill(validUser.email);
    await page.locator('input[name="password"]').fill(validUser.password);
    
    // Create account stays disabled until the terms checkbox is checked
    await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  test('should navigate to login page', async ({ page }) => {
    // Click "Sign in instead" link
    await page.getByRole('link', { name: /sign in instead/i }).click();
    
    // Should navigate to login page
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });

  test('should show loading state during submission', async ({ page }) => {
    // Fill valid form data
    await page.locator('input[name="fullName"]').fill(validUser.fullName);
    await page.locator('input[name="email"]').fill(validUser.email);
    await page.locator('input[name="password"]').fill(validUser.password);
    await page.getByRole('checkbox').check();
    
    let releaseSignup: () => void = () => undefined;
    const signupGate = new Promise<void>((resolve) => {
      releaseSignup = resolve;
    });
    await page.route('**/api/auth/sign-up/email', async (route) => {
      await signupGate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const submitButton = page.getByRole('button', { name: /create account/i });
    await submitButton.click();
    await expect(page.getByRole('button', { name: /creating account/i })).toBeDisabled();
    releaseSignup();
  });

  test('should handle successful signup', async ({ page }) => {
    let signedUp = false;
    await page.route('**/api/auth/sign-up/email', async (route) => {
      signedUp = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/me', async (route) => {
      if (!signedUp) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthorized"}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-user-id', email: validUser.email, name: validUser.fullName },
          organisation: { id: '11111111-1111-4111-8111-111111111111', name: "John Doe's organisation" },
          membership: { role: 'owner' },
          permissions: [],
        }),
      });
    });
    await page.route('**/api/business-profile', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not found"}' });
    });
    
    // Fill and submit valid form
    await page.locator('input[name="fullName"]').fill(validUser.fullName);
    await page.locator('input[name="email"]').fill(validUser.email);
    await page.locator('input[name="password"]').fill(validUser.password);
    await page.getByRole('checkbox').check();
    
    await page.getByRole('button', { name: /create account/i }).click();
    
    // Should redirect to onboarding page
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('should handle signup errors', async ({ page }) => {
    await page.route('**/api/auth/sign-up/email', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'User already registered' }),
      });
    });
    
    // Fill and submit form
    await page.locator('input[name="fullName"]').fill(validUser.fullName);
    await page.locator('input[name="email"]').fill(validUser.email);
    await page.locator('input[name="password"]').fill(validUser.password);
    await page.getByRole('checkbox').check();
    
    await page.getByRole('button', { name: /create account/i }).click();
    
    await expect(page.getByTestId('toast-message')).toContainText(/something in your details didn't save/i);
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check if form is still usable on mobile
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
    
    // Check if form fields are properly sized
    const nameInput = page.locator('input[name="fullName"]');
    const boundingBox = await nameInput.boundingBox();
    expect(boundingBox?.width).toBeGreaterThan(200); // Should have reasonable width
  });

  test('does not offer a Google or GitHub signup that cannot complete', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /github/i })).toHaveCount(0);
  });

  test('terms and privacy pages are reachable', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    // Check form inputs have proper names
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    
    // Check submit button has proper attributes
    const submitButton = page.getByRole('button', { name: /create account/i });
    await expect(submitButton).toHaveAttribute('type', 'submit');
    
    // Check password toggle has proper aria-label
    const passwordToggle = page.getByRole('button', { name: /show password/i });
    await expect(passwordToggle).toHaveAttribute('aria-label');
  });
});