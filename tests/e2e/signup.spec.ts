import { test, expect } from '@playwright/test';

// Test data
const validUser = {
  fullName: 'John Doe',
  email: `test+${Date.now()}@example.com`, // Unique email for each test run
  password: 'SecurePass123',
};

const invalidPasswords = [
  { password: 'weak', error: 'Password must be at least 8 characters' },
  { password: 'alllowercase123', error: 'Password must contain uppercase, lowercase, and number' },
  { password: 'ALLUPPERCASE123', error: 'Password must contain uppercase, lowercase, and number' },
  { password: 'NoNumbers', error: 'Password must contain uppercase, lowercase, and number' },
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
    await expect(page.locator('input[name="password"]')).toHaveAttribute('placeholder', 'Create a password');
    
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
    await expect(passwordInput).toHaveAttribute('placeholder', 'Create a password');
    
    // Test that placeholder disappears when focused (better UX with floating label)
    await nameInput.focus();
    await expect(nameInput).toHaveAttribute('placeholder', '');
    
    // Test that floating label works and placeholder returns when unfocused without value
    await nameInput.blur();
    await expect(nameInput).toHaveAttribute('placeholder', 'Enter your full name');
    
    // Test typing behavior
    await nameInput.focus();
    await nameInput.fill('John Doe');
    await expect(nameInput).toHaveValue('John Doe');
    
    // When field has value, placeholder should remain empty even when unfocused
    await nameInput.blur();
    await expect(nameInput).toHaveAttribute('placeholder', '');
  });

  test('should show password strength indicator on focus', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"]');
    
    // Focus on password field
    await passwordInput.focus();
    
    // Password strength indicator should appear
    await expect(page.locator('.password-strength, [data-testid="password-strength"]')).toBeVisible();
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
    
    // Interact with fields to trigger validation
    await page.locator('input[name="fullName"]').focus();
    await page.locator('input[name="fullName"]').blur();
    
    await page.locator('input[name="email"]').focus();
    await page.locator('input[name="email"]').blur();
    
    await page.locator('input[name="password"]').focus();
    await page.locator('input[name="password"]').blur();
    
    // Should show validation errors after interaction
    await expect(page.getByText('Full name must be at least 2 characters')).toBeVisible();
    await expect(page.getByText('Invalid email address')).toBeVisible();
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
    
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
        
        // Try to submit
        await page.getByRole('button', { name: /create account/i }).click();
        
        // Should show password validation error
        await expect(page.getByText(error)).toBeVisible();
      });
    });
  });

  test('should validate email format', async ({ page }) => {
    // Fill form with invalid email
    await page.locator('input[name="fullName"]').fill(validUser.fullName);
    await page.locator('input[name="email"]').fill('invalid-email');
    await page.locator('input[name="password"]').fill(validUser.password);
    await page.getByRole('checkbox').check();
    
    // Try to submit
    await page.getByRole('button', { name: /create account/i }).click();
    
    // Should show email validation error
    await expect(page.getByText('Invalid email address')).toBeVisible();
  });

  test('should require terms agreement', async ({ page }) => {
    // Fill all fields except terms checkbox
    await page.locator('input[name="fullName"]').fill(validUser.fullName);
    await page.locator('input[name="email"]').fill(validUser.email);
    await page.locator('input[name="password"]').fill(validUser.password);
    
    // Try to submit without checking terms
    await page.getByRole('button', { name: /create account/i }).click();
    
    // Should show terms validation error
    await expect(page.getByText('You must agree to the terms and conditions')).toBeVisible();
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
    
    // Mock slow network response to see loading state
    await page.route('**/auth/v1/signup', async route => {
      await page.waitForTimeout(1000); // Simulate slow response
      await route.continue();
    });
    
    const submitButton = page.getByRole('button', { name: /create account/i });
    
    // Submit form
    await submitButton.click();
    
    // Should show loading state
    await expect(submitButton).toBeDisabled();
    await expect(page.getByText(/creating account/i)).toBeVisible();
  });

  test('should handle successful signup', async ({ page }) => {
    // Mock successful signup response
    await page.route('**/auth/v1/signup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            email: validUser.email,
            user_metadata: { full_name: validUser.fullName }
          }
        })
      });
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
    // Mock error response
    await page.route('**/auth/v1/signup', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'User already registered'
        })
      });
    });
    
    // Fill and submit form
    await page.locator('input[name="fullName"]').fill(validUser.fullName);
    await page.locator('input[name="email"]').fill(validUser.email);
    await page.locator('input[name="password"]').fill(validUser.password);
    await page.getByRole('checkbox').check();
    
    await page.getByRole('button', { name: /create account/i }).click();
    
    // Should show error message
    await expect(page.getByText(/user already registered/i)).toBeVisible();
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

  test('should show social signup options as coming soon', async ({ page }) => {
    // Check if social signup buttons exist
    const googleButton = page.getByRole('button', { name: /google/i });
    const githubButton = page.getByRole('button', { name: /github/i });
    
    await expect(googleButton).toBeVisible();
    await expect(githubButton).toBeVisible();
    
    // Click Google button
    await googleButton.click();
    
    // Should show "Coming Soon" toast
    await expect(page.getByText(/coming soon/i)).toBeVisible();
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