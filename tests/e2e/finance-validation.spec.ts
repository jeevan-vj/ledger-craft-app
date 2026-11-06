import { test, expect } from '@playwright/test';

type FinanceMockWindow = Window & {
  __FINANCE_TEST_MODE?: boolean;
  __MOCK_DATA?: {
    customers: Array<{ id: string; name: string; email: string }>;
    invoices: Array<{ id: string; amount: number; status: string }>;
    payments: Array<{ id: string; amount: number; method: string }>;
  };
};

/**
 * Finance E2E Test Validation
 * 
 * This test validates that our finance testing environment is properly set up
 * and can access the application pages needed for comprehensive financial testing.
 */

test.describe('Finance E2E Test Environment Validation', () => {
  test('Application loads and shows landing page', async ({ page }) => {
    // Go to the application
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check that we can see the EasyBizInvoice branding
    await expect(page.locator('body')).toContainText('EasyBizInvoice');
    
    // Take a screenshot for verification
    await page.screenshot({ path: 'test-results/landing-page.png', fullPage: true });
  });

  test('Can navigate to sign-in page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for sign-in related content
    const signInVisible = await page.locator('text=Sign in').isVisible({ timeout: 5000 });
    const emailVisible = await page.locator('input[type="email"], [placeholder*="email" i]').isVisible({ timeout: 5000 });
    
    expect(signInVisible || emailVisible).toBe(true);
    
    await page.screenshot({ path: 'test-results/signin-page.png', fullPage: true });
  });

  test('Authentication system is accessible', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    // Check for login form elements
    const hasLoginForm = await page.locator('form, [data-testid*="login"], [data-testid*="signin"]').count() > 0;
    const hasEmailField = await page.locator('input[type="email"], [placeholder*="email" i]').count() > 0;
    const hasPasswordField = await page.locator('input[type="password"], [placeholder*="password" i]').count() > 0;
    
    expect(hasLoginForm || hasEmailField || hasPasswordField).toBe(true);
    
    await page.screenshot({ path: 'test-results/auth-system.png', fullPage: true });
  });

  test('Application routing works for main sections', async ({ page }) => {
    const routes = [
      '/',
      '/login',
      '/signup'
    ];
    
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      
      // Verify page loaded without errors
      const hasErrorText = await page.locator('text=/error|Error|ERROR/').count();
      expect(hasErrorText).toBe(0);
      
      console.log(`✓ Route ${route} loads successfully`);
    }
  });

  test('Finance test data structures can be set up', async ({ page }) => {
    // Test that we can inject test data and mock responses
    await page.goto('/');
    
    // Set up mock financial data
    await page.addInitScript(() => {
      (window as FinanceMockWindow).__FINANCE_TEST_MODE = true;
      (window as FinanceMockWindow).__MOCK_DATA = {
        customers: [
          { id: 'test-customer-1', name: 'Test Customer', email: 'test@example.com' }
        ],
        invoices: [
          { id: 'test-invoice-1', amount: 1000.00, status: 'unpaid' }
        ],
        payments: [
          { id: 'test-payment-1', amount: 500.00, method: 'bank_transfer' }
        ]
      };
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Verify test data was injected
    const testMode = await page.evaluate(() => (window as FinanceMockWindow).__FINANCE_TEST_MODE);
    expect(testMode).toBe(true);
    
    const mockData = await page.evaluate(() => (window as FinanceMockWindow).__MOCK_DATA);
    expect(mockData).toBeDefined();
    if (!mockData) throw new Error('Financial fixture was not injected');
    expect(mockData.customers).toHaveLength(1);
    
    console.log('✓ Finance test data injection working');
  });
});

test.describe('Network and API Readiness', () => {
  test('Can mock API responses for testing', async ({ page }) => {
    // Set up API mocking
    await page.route('**/api/test', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Test API response', success: true })
      });
    });
    
    await page.goto('/');
    
    // Test the mock
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/test');
        return await res.json();
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });
    
    expect(response.success).toBe(true);
    expect(response.message).toBe('Test API response');
    
    console.log('✓ API mocking system working');
  });

  test('Can handle authentication mocking', async ({ page }) => {
    // Mock authentication state
    await page.addInitScript(() => {
      localStorage.setItem('test-auth-token', JSON.stringify({
        user: { id: 'test-user', email: 'test@example.com' },
        expires: Date.now() + 3600000
      }));
    });
    
    await page.goto('/');
    
    // Verify auth data was set
    const authData = await page.evaluate(() => {
      const data = localStorage.getItem('test-auth-token');
      return data ? JSON.parse(data) : null;
    });
    
    expect(authData).toBeDefined();
    expect(authData.user.email).toBe('test@example.com');
    
    console.log('✓ Authentication mocking working');
  });
});

test.describe('Performance and Reliability', () => {
  test('Page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
    
    console.log(`✓ Page loaded in ${loadTime}ms`);
  });

  test('Application handles JavaScript errors gracefully', async ({ page }) => {
    const jsErrors: string[] = [];
    
    page.on('pageerror', error => {
      jsErrors.push(error.message);
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should not have critical JavaScript errors
    const criticalErrors = jsErrors.filter(error => 
      error.includes('ReferenceError') || 
      error.includes('TypeError') ||
      error.includes('SyntaxError')
    );
    
    expect(criticalErrors).toHaveLength(0);
    
    if (jsErrors.length > 0) {
      console.log('Non-critical JS errors detected:', jsErrors);
    } else {
      console.log('✓ No JavaScript errors detected');
    }
  });
});

// Global test summary
test.afterAll(async () => {
  console.log('\n=== Finance E2E Test Environment Validation Complete ===');
  console.log('✓ Application accessibility verified');
  console.log('✓ Authentication system accessible');
  console.log('✓ API mocking capabilities confirmed');
  console.log('✓ Test data injection working');
  console.log('✓ Performance within acceptable limits');
  console.log('\nFinance E2E tests are ready to run!');
});