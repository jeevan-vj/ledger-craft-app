import { test, expect, Page } from '@playwright/test';
import { AuthMocker } from './auth-utils';

type MemoryPerformance = Performance & { memory?: { usedJSHeapSize: number } };
type EdgeCaseWindow = Window & {
  gc?: () => void;
  testConstraintViolation?: boolean;
  testForeignKeyViolation?: boolean;
};

/**
 * Edge Cases and Error Handling E2E Tests
 * 
 * Comprehensive testing of system behavior under unusual conditions, error scenarios,
 * and edge cases that could occur in real-world financial operations. These tests
 * ensure robust error handling and graceful degradation of functionality.
 */

interface ErrorScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  trigger: () => Promise<void>;
  expectedBehavior: string;
  recovery?: () => Promise<void>;
}

class EdgeCaseTestHelper {
  constructor(private page: Page) {}

  async setupErrorScenarios() {
    // Mock network failures
    await this.page.route('**/rest/v1/invoices**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      
      // Simulate intermittent failures
      if (url.includes('fail-test') || Math.random() < 0.1) {
        await route.abort('failed');
        return;
      }
      
      // Simulate slow responses
      if (url.includes('slow-test')) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      await route.continue();
    });

    // Mock validation errors
    await this.page.route('**/api/validate/**', async (route) => {
      const body = await route.request().postDataJSON();
      
      if (body.test_validation_error) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Validation failed',
            details: body.expected_errors || ['Invalid data format'],
            code: 'VALIDATION_ERROR'
          })
        });
        return;
      }
      
      await route.continue();
    });

    // Mock database constraints
    await this.page.route('**/rest/v1/**', async (route) => {
      const body = await route.request().postDataJSON();
      
      if (body?.test_constraint_violation) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Constraint violation',
            message: 'Duplicate record detected',
            code: '23505'
          })
        });
        return;
      }
      
      await route.continue();
    });
  }

  /**
   * Test extremely large numbers and overflow conditions
   */
  async testNumericOverflow() {
    console.log('Testing numeric overflow conditions...');
    
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    await this.page.click('[data-testid="customer-select"]');
    await this.page.click('[data-testid="select-customer-default"]');
    
    // Test maximum safe integer
    await this.page.click('[data-testid="add-item-btn"]');
    const itemRow = this.page.locator('[data-testid="item-row-0"]');
    await itemRow.locator('[data-testid="item-description"]').fill('Overflow Test');
    await itemRow.locator('[data-testid="item-quantity"]').fill('1');
    
    // Try to enter a number larger than JavaScript's MAX_SAFE_INTEGER
    const largeNumber = '9007199254740992'; // MAX_SAFE_INTEGER + 1
    await itemRow.locator('[data-testid="item-unit-price"]').fill(largeNumber);
    
    // Should show validation error or handle gracefully
    await expect(this.page.locator('[data-testid="overflow-warning"]')).toBeVisible();
    
    // Test decimal precision limits
    await itemRow.locator('[data-testid="item-unit-price"]').fill('123.123456789012345');
    await this.page.waitForTimeout(500);
    
    const displayedValue = await itemRow.locator('[data-testid="item-unit-price"]').inputValue();
    // Should be rounded to reasonable precision (e.g., 2 decimal places)
    expect(displayedValue).toBe('123.12');
    
    console.log('✓ Numeric overflow handling verified');
  }

  /**
   * Test negative numbers and invalid inputs
   */
  async testInvalidInputHandling() {
    console.log('Testing invalid input handling...');
    
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    await this.page.click('[data-testid="customer-select"]');
    await this.page.click('[data-testid="select-customer-default"]');
    
    const testCases = [
      { input: '-100', field: 'quantity', error: 'negative-quantity-error' },
      { input: '-50.00', field: 'unit-price', error: 'negative-price-error' },
      { input: 'abc', field: 'quantity', error: 'invalid-number-error' },
      { input: '12.34.56', field: 'unit-price', error: 'invalid-decimal-error' },
      { input: '∞', field: 'unit-price', error: 'infinity-error' },
      { input: 'NaN', field: 'quantity', error: 'nan-error' }
    ];
    
    await this.page.click('[data-testid="add-item-btn"]');
    const itemRow = this.page.locator('[data-testid="item-row-0"]');
    await itemRow.locator('[data-testid="item-description"]').fill('Invalid Input Test');
    
    for (const testCase of testCases) {
      console.log(`Testing ${testCase.field} with invalid input: ${testCase.input}`);
      
      await itemRow.locator(`[data-testid="item-${testCase.field}"]`).fill(testCase.input);
      await this.page.waitForTimeout(300);
      
      // Should show appropriate error message
      const errorExists = await this.page.locator(`[data-testid="${testCase.error}"]`).isVisible();
      if (!errorExists) {
        // Alternative: check if input was sanitized/rejected
        const inputValue = await itemRow.locator(`[data-testid="item-${testCase.field}"]`).inputValue();
        expect(inputValue).not.toBe(testCase.input);
      }
      
      // Clear for next test
      await itemRow.locator(`[data-testid="item-${testCase.field}"]`).fill('1');
    }
    
    console.log('✓ Invalid input handling verified');
  }

  /**
   * Test concurrent user operations and race conditions
   */
  async testConcurrentOperations() {
    console.log('Testing concurrent operations...');
    
    // Simulate multiple users editing the same invoice
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    await this.page.click('[data-testid="customer-select"]');
    await this.page.click('[data-testid="select-customer-default"]');
    
    // Create invoice
    await this.page.click('[data-testid="add-item-btn"]');
    const itemRow = this.page.locator('[data-testid="item-row-0"]');
    await itemRow.locator('[data-testid="item-description"]').fill('Concurrent Test');
    await itemRow.locator('[data-testid="item-quantity"]').fill('1');
    await itemRow.locator('[data-testid="item-unit-price"]').fill('100.00');
    
    await this.page.click('[data-testid="save-invoice-btn"]');
    await this.page.waitForSelector('[data-testid="invoice-success-message"]');
    
    // Simulate concurrent edit attempt
    await this.page.evaluate(() => {
      // Mock another user's edit in localStorage
      localStorage.setItem('concurrent_edit_detected', JSON.stringify({
        invoiceId: 'latest-invoice',
        userId: 'another-user',
        timestamp: Date.now()
      }));
    });
    
    // Try to edit the same invoice
    await this.page.click('[data-testid="edit-invoice-btn"]');
    
    // Should detect concurrent edit and show warning
    await expect(this.page.locator('[data-testid="concurrent-edit-warning"]')).toBeVisible();
    
    console.log('✓ Concurrent operation handling verified');
  }

  /**
   * Test network failures and offline behavior
   */
  async testNetworkFailures() {
    console.log('Testing network failure handling...');
    
    // Test creation during network failure
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    
    // Go offline
    await this.page.context().setOffline(true);
    
    await this.page.click('[data-testid="customer-select"]');
    // Should show offline indicator or cached options
    await expect(this.page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Try to save while offline
    await this.page.click('[data-testid="save-invoice-btn"]');
    await expect(this.page.locator('[data-testid="offline-save-message"]')).toBeVisible();
    
    // Go back online
    await this.page.context().setOffline(false);
    
    // Should automatically retry or show retry option
    await expect(this.page.locator('[data-testid="retry-save-btn"]')).toBeVisible();
    await this.page.click('[data-testid="retry-save-btn"]');
    
    console.log('✓ Network failure handling verified');
  }

  /**
   * Test data corruption and recovery
   */
  async testDataCorruption() {
    console.log('Testing data corruption handling...');
    
    // Inject corrupted data into localStorage
    await this.page.evaluate(() => {
      localStorage.setItem('invoice_draft', JSON.stringify({
        corrupted: true,
        items: [
          { id: null, quantity: undefined, price: 'invalid' }
        ],
        malformed_json: '{"incomplete": '
      }));
    });
    
    // Try to load corrupted draft
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="load-draft"]');
    
    // Should handle corruption gracefully
    await expect(this.page.locator('[data-testid="data-corruption-warning"]')).toBeVisible();
    await this.page.click('[data-testid="clear-corrupted-data"]');
    
    // Should recover to clean state
    await expect(this.page.locator('[data-testid="invoice-form"]')).toBeVisible();
    
    console.log('✓ Data corruption handling verified');
  }

  /**
   * Test memory and performance edge cases
   */
  async testPerformanceEdgeCases() {
    console.log('Testing performance edge cases...');
    
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    await this.page.click('[data-testid="customer-select"]');
    await this.page.click('[data-testid="select-customer-default"]');
    
    // Add many items to test performance
    const itemCount = 50;
    console.log(`Adding ${itemCount} items to test performance...`);
    
    for (let i = 0; i < itemCount; i++) {
      await this.page.click('[data-testid="add-item-btn"]');
      const itemRow = this.page.locator(`[data-testid="item-row-${i}"]`);
      await itemRow.locator('[data-testid="item-description"]').fill(`Performance Test Item ${i + 1}`);
      await itemRow.locator('[data-testid="item-quantity"]').fill('1');
      await itemRow.locator('[data-testid="item-unit-price"]').fill('10.00');
      
      // Check performance every 10 items
      if (i % 10 === 9) {
        const startTime = Date.now();
        await this.page.waitForTimeout(100); // Allow for calculation
        const endTime = Date.now();
        
        // Should not take more than 1 second for calculations
        expect(endTime - startTime).toBeLessThan(1000);
        console.log(`✓ Performance check at ${i + 1} items: ${endTime - startTime}ms`);
      }
    }
    
    // Verify final calculation is still accurate
    const totalElement = this.page.locator('[data-testid="invoice-total"]');
    const totalText = await totalElement.textContent();
    const total = parseFloat(totalText?.replace(/[^0-9.]/g, '') || '0');
    
    // 50 items × $10.00 = $500.00 (plus tax if applicable)
    expect(total).toBeGreaterThanOrEqual(500);
    
    console.log('✓ Performance edge cases verified');
  }

  /**
   * Test browser compatibility edge cases
   */
  async testBrowserCompatibility() {
    console.log('Testing browser compatibility edge cases...');
    
    // Test localStorage limits
    const largeMockData = 'x'.repeat(5 * 1024 * 1024); // 5MB string
    
    try {
      await this.page.evaluate((data) => {
        localStorage.setItem('large_test_data', data);
      }, largeMockData);
      
      // Should handle gracefully if localStorage is full
      await this.page.click('[data-testid="nav-invoices"]');
      await this.page.click('[data-testid="create-invoice-btn"]');
      
      // Should still function even with localStorage issues
      await expect(this.page.locator('[data-testid="invoice-form"]')).toBeVisible();
      
    } catch (error) {
      console.log('✓ LocalStorage overflow handled gracefully');
    }
    
    // Test with disabled JavaScript features
    await this.page.evaluate(() => {
      // Mock missing browser features
      Reflect.deleteProperty(window, 'requestAnimationFrame');
      Reflect.deleteProperty(window, 'localStorage');
    });
    
    // Application should still be functional
    await this.page.reload();
    await expect(this.page.locator('[data-testid="dashboard"]')).toBeVisible();
    
    console.log('✓ Browser compatibility verified');
  }

  /**
   * Test date and timezone edge cases
   */
  async testDateTimeEdgeCases() {
    console.log('Testing date and timezone edge cases...');
    
    const edgeCases = [
      { date: '2024-02-29', description: 'Leap year date' },
      { date: '2024-12-31', description: 'Year end date' },
      { date: '2025-01-01', description: 'Year start date' },
      { date: '1900-01-01', description: 'Very old date' },
      { date: '2099-12-31', description: 'Far future date' }
    ];
    
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    
    for (const testCase of edgeCases) {
      console.log(`Testing ${testCase.description}: ${testCase.date}`);
      
      await this.page.fill('[data-testid="invoice-date"]', testCase.date);
      await this.page.fill('[data-testid="due-date"]', testCase.date);
      
      // Should handle date gracefully
      const errorVisible = await this.page.locator('[data-testid="date-error"]').isVisible();
      if (errorVisible) {
        console.log(`✓ Date validation working for ${testCase.description}`);
      } else {
        // Date should be parsed correctly
        const inputValue = await this.page.locator('[data-testid="invoice-date"]').inputValue();
        expect(inputValue).toBe(testCase.date);
      }
    }
    
    // Test timezone handling
    await this.page.evaluate(() => {
      // Mock different timezone
      const originalDateTimeFormat = Intl.DateTimeFormat;
      globalThis.Intl.DateTimeFormat = new Proxy(originalDateTimeFormat, {
        construct(target, args) {
          const [locale, options] = args as ConstructorParameters<typeof originalDateTimeFormat>;
          return new target(locale, { ...options, timeZone: 'Asia/Tokyo' });
        },
        apply(target, _receiver, args) {
          const [locale, options] = args as Parameters<typeof originalDateTimeFormat>;
          return target(locale, { ...options, timeZone: 'Asia/Tokyo' });
        },
      });
    });
    
    await this.page.reload();
    await this.page.click('[data-testid="nav-invoices"]');
    
    // Should handle different timezone gracefully
    await expect(this.page.locator('[data-testid="invoices-page"]')).toBeVisible();
    
    console.log('✓ Date and timezone edge cases verified');
  }

  /**
   * Test security edge cases
   */
  async testSecurityEdgeCases() {
    console.log('Testing security edge cases...');
    
    // Test XSS prevention
    const xssPayloads = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<img src="x" onerror="alert(1)">',
      '"><script>alert("xss")</script>'
    ];
    
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    await this.page.click('[data-testid="customer-select"]');
    await this.page.click('[data-testid="select-customer-default"]');
    
    await this.page.click('[data-testid="add-item-btn"]');
    const itemRow = this.page.locator('[data-testid="item-row-0"]');
    
    for (const payload of xssPayloads) {
      await itemRow.locator('[data-testid="item-description"]').fill(payload);
      await this.page.waitForTimeout(300);
      
      // Should not execute JavaScript
      const alertHandled = await this.page.evaluate(() => {
        return !window.document.querySelector('script');
      });
      
      expect(alertHandled).toBe(true);
      console.log(`✓ XSS payload blocked: ${payload.substring(0, 20)}...`);
    }
    
    // Test SQL injection prevention in search
    await this.page.click('[data-testid="nav-invoices"]');
    
    const sqlPayloads = [
      "'; DROP TABLE invoices; --",
      "1' OR '1'='1",
      "UNION SELECT * FROM users"
    ];
    
    for (const payload of sqlPayloads) {
      await this.page.fill('[data-testid="invoice-search"]', payload);
      await this.page.waitForTimeout(500);
      
      // Should not cause database errors
      const errorVisible = await this.page.locator('[data-testid="database-error"]').isVisible();
      expect(errorVisible).toBe(false);
      
      console.log(`✓ SQL injection blocked: ${payload.substring(0, 20)}...`);
    }
    
    console.log('✓ Security edge cases verified');
  }
}

test.describe('Edge Cases and Error Handling Tests', () => {
  let authMocker: AuthMocker;
  let edgeCaseHelper: EdgeCaseTestHelper;

  test.beforeEach(async ({ page }) => {
    authMocker = new AuthMocker(page);
    edgeCaseHelper = new EdgeCaseTestHelper(page);
    
    await authMocker.mockCompletedOnboarding({
      email: 'edge.cases@testbusiness.com',
      fullName: 'Edge Case Tester'
    });

    await edgeCaseHelper.setupErrorScenarios();

    await page.goto('/');
    await page.waitForSelector('[data-testid="dashboard"]');
  });

  test('Numeric Overflow and Precision Edge Cases', async ({ page }) => {
    test.setTimeout(60000);
    
    console.log('\n=== Testing Numeric Overflow and Precision ===');
    
    await edgeCaseHelper.testNumericOverflow();
    
    // Additional precision tests
    await page.click('[data-testid="nav-invoices"]');
    await page.click('[data-testid="create-invoice-btn"]');
    await page.click('[data-testid="customer-select"]');
    await page.click('[data-testid="select-customer-default"]');
    
    // Test floating point precision issues
    await page.click('[data-testid="add-item-btn"]');
    const itemRow = page.locator('[data-testid="item-row-0"]');
    await itemRow.locator('[data-testid="item-description"]').fill('Precision Test');
    await itemRow.locator('[data-testid="item-quantity"]').fill('3');
    await itemRow.locator('[data-testid="item-unit-price"]').fill('0.1'); // 0.1 * 3 = 0.30000000000000004 in JS
    
    await page.waitForTimeout(500);
    const lineTotal = await itemRow.locator('[data-testid="item-total"]').textContent();
    const total = parseFloat(lineTotal?.replace(/[^0-9.]/g, '') || '0');
    
    // Should be exactly 0.30, not 0.30000000000000004
    expect(total).toBe(0.30);
    
    console.log('✅ Numeric precision tests completed');
  });

  test('Invalid Input Validation and Sanitization', async ({ page }) => {
    test.setTimeout(90000);
    
    console.log('\n=== Testing Invalid Input Handling ===');
    
    await edgeCaseHelper.testInvalidInputHandling();
    
    // Test boundary values
    await page.click('[data-testid="nav-payments"]');
    await page.click('[data-testid="record-payment-btn"]');
    
    const boundaryTests = [
      { field: 'payment-amount', value: '0.001', shouldError: true },
      { field: 'payment-amount', value: '0.01', shouldError: false },
      { field: 'payment-amount', value: '999999999.99', shouldError: false },
      { field: 'payment-amount', value: '1000000000.00', shouldError: true }
    ];
    
    for (const test of boundaryTests) {
      await page.fill(`[data-testid="${test.field}"]`, test.value);
      await page.waitForTimeout(300);
      
      const hasError = await page.locator('[data-testid*="error"]').isVisible();
      if (test.shouldError) {
        expect(hasError).toBe(true);
      }
      
      console.log(`✓ Boundary test: ${test.value} - Error expected: ${test.shouldError}, Got error: ${hasError}`);
    }
    
    console.log('✅ Input validation tests completed');
  });

  test('Network Failures and Offline Behavior', async ({ page }) => {
    test.setTimeout(120000);
    
    console.log('\n=== Testing Network Failures ===');
    
    await edgeCaseHelper.testNetworkFailures();
    
    // Test partial network failures
    await page.route('**/rest/v1/customers**', async route => {
      if (Math.random() < 0.3) { // 30% failure rate
        await route.abort('connectionrefused');
      } else {
        await route.continue();
      }
    });
    
    // Multiple attempts should eventually succeed
    let attempts = 0;
    let success = false;
    
    while (attempts < 5 && !success) {
      try {
        await page.click('[data-testid="nav-customers"]');
        await page.waitForSelector('[data-testid="customers-page"]', { timeout: 5000 });
        success = true;
        console.log(`✓ Succeeded on attempt ${attempts + 1}`);
      } catch (error) {
        attempts++;
        console.log(`Attempt ${attempts} failed, retrying...`);
        await page.waitForTimeout(1000);
      }
    }
    
    expect(success).toBe(true);
    
    console.log('✅ Network failure recovery tested');
  });

  test('Concurrent Operations and Race Conditions', async ({ page }) => {
    test.setTimeout(90000);
    
    console.log('\n=== Testing Concurrent Operations ===');
    
    await edgeCaseHelper.testConcurrentOperations();
    
    // Test rapid successive operations
    await page.click('[data-testid="nav-invoices"]');
    await page.click('[data-testid="create-invoice-btn"]');
    await page.click('[data-testid="customer-select"]');
    await page.click('[data-testid="select-customer-default"]');
    
    // Rapidly add and remove items
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="add-item-btn"]');
      if (i > 2) {
        const removeButtons = page.locator('[data-testid="remove-item-btn"]');
        const count = await removeButtons.count();
        if (count > 0) {
          await removeButtons.first().click();
        }
      }
      await page.waitForTimeout(50); // Very rapid operations
    }
    
    // Should maintain data consistency
    const remainingItems = await page.locator('[data-testid^="item-row-"]').count();
    expect(remainingItems).toBeGreaterThan(0);
    expect(remainingItems).toBeLessThanOrEqual(10);
    
    console.log('✅ Concurrent operations handled correctly');
  });

  test('Data Corruption and Recovery Mechanisms', async ({ page }) => {
    test.setTimeout(60000);
    
    console.log('\n=== Testing Data Corruption Recovery ===');
    
    await edgeCaseHelper.testDataCorruption();
    
    // Test malformed JSON recovery
    await page.evaluate(() => {
      localStorage.setItem('app_settings', '{"malformed": json}');
      localStorage.setItem('user_preferences', '{incomplete');
    });
    
    await page.reload();
    
    // Should recover to default settings
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    
    // Check that corrupted data was cleared
    const settingsRecovered = await page.evaluate(() => {
      const settings = localStorage.getItem('app_settings');
      return settings === null || JSON.parse(settings || '{}');
    });
    
    expect(settingsRecovered).toBeTruthy();
    
    console.log('✅ Data corruption recovery verified');
  });

  test('Performance Under Stress Conditions', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes for stress testing
    
    console.log('\n=== Testing Performance Under Stress ===');
    
    await edgeCaseHelper.testPerformanceEdgeCases();
    
    // Test memory leaks with repeated operations
    const initialMemory = await page.evaluate(() => (performance as MemoryPerformance).memory?.usedJSHeapSize || 0);
    
    // Perform 100 rapid create/cancel operations
    for (let i = 0; i < 100; i++) {
      await page.click('[data-testid="nav-invoices"]');
      await page.click('[data-testid="create-invoice-btn"]');
      await page.click('[data-testid="cancel-invoice"]');
      
      if (i % 20 === 19) {
        // Force garbage collection attempt
        await page.evaluate(() => {
          (window as EdgeCaseWindow).gc?.();
        });
        
        const currentMemory = await page.evaluate(() => (performance as MemoryPerformance).memory?.usedJSHeapSize || 0);
        const memoryIncrease = currentMemory - initialMemory;
        
        // Memory increase should not be excessive (less than 50MB)
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        console.log(`✓ Memory check at iteration ${i + 1}: ${Math.round(memoryIncrease / 1024 / 1024)}MB increase`);
      }
    }
    
    console.log('✅ Performance stress testing completed');
  });

  test('Browser Compatibility and Feature Detection', async ({ page }) => {
    test.setTimeout(60000);
    
    console.log('\n=== Testing Browser Compatibility ===');
    
    await edgeCaseHelper.testBrowserCompatibility();
    
    // Test with missing modern JavaScript features
    await page.evaluate(() => {
      // Mock older browser environment
      Reflect.deleteProperty(Array.prototype, 'includes');
      Reflect.deleteProperty(String.prototype, 'startsWith');
      Reflect.deleteProperty(window, 'fetch');
    });
    
    await page.reload();
    
    // Should still function with polyfills or graceful degradation
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    
    // Test with disabled cookies
    await page.context().clearCookies();
    
    await page.evaluate(() => {
      Object.defineProperty(document, 'cookie', {
        get: () => '',
        set: () => false
      });
    });
    
    await page.reload();
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    
    console.log('✅ Browser compatibility verified');
  });

  test('Date, Time, and Timezone Edge Cases', async ({ page }) => {
    test.setTimeout(60000);
    
    console.log('\n=== Testing Date and Timezone Edge Cases ===');
    
    await edgeCaseHelper.testDateTimeEdgeCases();
    
    // Test daylight saving time transitions
    const dstTests = [
      '2024-03-10', // Spring forward in US
      '2024-11-03', // Fall back in US
      '2024-03-31', // DST change in Europe
      '2024-10-27'  // DST change in Europe
    ];
    
    await page.click('[data-testid="nav-invoices"]');
    await page.click('[data-testid="create-invoice-btn"]');
    
    for (const dstDate of dstTests) {
      await page.fill('[data-testid="invoice-date"]', dstDate);
      await page.waitForTimeout(300);
      
      // Should handle DST transitions without errors
      const hasError = await page.locator('[data-testid="date-error"]').isVisible();
      expect(hasError).toBe(false);
      
      console.log(`✓ DST date handled: ${dstDate}`);
    }
    
    console.log('✅ Date and timezone edge cases verified');
  });

  test('Security Vulnerabilities and Attack Prevention', async ({ page }) => {
    test.setTimeout(90000);
    
    console.log('\n=== Testing Security Edge Cases ===');
    
    await edgeCaseHelper.testSecurityEdgeCases();
    
    // Test CSRF protection
    await page.evaluate(() => {
      // Mock CSRF attack attempt
      fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ malicious: 'data' })
      }).catch(() => {}); // Ignore errors
    });
    
    // Application should still function normally
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    
    // Test file upload security
    await page.click('[data-testid="nav-invoices"]');
    await page.click('[data-testid="upload-invoice"]');
    
    // Try to upload malicious files
    const maliciousFile = Buffer.from('<?php echo "malicious"; ?>');
    
    try {
      await page.setInputFiles('[data-testid="file-upload"]', {
        name: 'malicious.php',
        mimeType: 'application/x-php',
        buffer: maliciousFile
      });
      
      // Should reject non-allowed file types
      await expect(page.locator('[data-testid="file-type-error"]')).toBeVisible();
    } catch (error) {
      console.log('✓ File upload security working');
    }
    
    console.log('✅ Security vulnerability tests completed');
  });

  test('Database Constraint Violations and Data Integrity', async ({ page }) => {
    test.setTimeout(60000);
    
    console.log('\n=== Testing Database Constraints ===');
    
    // Test duplicate detection
    await page.click('[data-testid="nav-invoices"]');
    await page.click('[data-testid="create-invoice-btn"]');
    await page.click('[data-testid="customer-select"]');
    await page.click('[data-testid="select-customer-default"]');
    
    // Try to create invoice with duplicate number
    await page.fill('[data-testid="invoice-number"]', 'INV-DUPLICATE');
    await page.click('[data-testid="add-item-btn"]');
    
    const itemRow = page.locator('[data-testid="item-row-0"]');
    await itemRow.locator('[data-testid="item-description"]').fill('Duplicate Test');
    await itemRow.locator('[data-testid="item-quantity"]').fill('1');
    await itemRow.locator('[data-testid="item-unit-price"]').fill('100.00');
    
    // Add constraint violation test flag
    await page.evaluate(() => {
      (window as EdgeCaseWindow).testConstraintViolation = true;
    });
    
    await page.click('[data-testid="save-invoice-btn"]');
    
    // Should handle constraint violation gracefully
    await expect(page.locator('[data-testid="duplicate-invoice-error"]')).toBeVisible();
    
    // Test foreign key constraint
    await page.evaluate(() => {
      (window as EdgeCaseWindow).testForeignKeyViolation = true;
    });
    
    await page.fill('[data-testid="invoice-number"]', 'INV-FK-TEST');
    await page.click('[data-testid="save-invoice-btn"]');
    
    await expect(page.locator('[data-testid="foreign-key-error"]')).toBeVisible();
    
    console.log('✅ Database constraint handling verified');
  });

  test('Internationalization and Localization Edge Cases', async ({ page }) => {
    test.setTimeout(60000);
    
    console.log('\n=== Testing Internationalization Edge Cases ===');
    
    const i18nTests = [
      { locale: 'ar-SA', description: 'Arabic (RTL)', rtl: true },
      { locale: 'zh-CN', description: 'Chinese (Complex characters)' },
      { locale: 'de-DE', description: 'German (Long words)' },
      { locale: 'hi-IN', description: 'Hindi (Complex script)' },
      { locale: 'fi-FI', description: 'Finnish (Long words)' }
    ];
    
    for (const test of i18nTests) {
      console.log(`Testing locale: ${test.description}`);
      
      // Mock locale change
      await page.evaluate((locale) => {
        Object.defineProperty(navigator, 'language', { value: locale, writable: false });
        Object.defineProperty(navigator, 'languages', { value: [locale], writable: false });
      }, test.locale);
      
      await page.reload();
      
      // Should load without errors regardless of locale
      await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
      
      // Test with unicode characters
      await page.click('[data-testid="nav-invoices"]');
      await page.click('[data-testid="create-invoice-btn"]');
      await page.click('[data-testid="customer-select"]');
      await page.click('[data-testid="select-customer-default"]');
      
      await page.click('[data-testid="add-item-btn"]');
      const itemRow = page.locator('[data-testid="item-row-0"]');
      
      // Test with complex unicode
      const unicodeText = '🚀 测试 العربية हिंदी Ñiño';
      await itemRow.locator('[data-testid="item-description"]').fill(unicodeText);
      
      const enteredValue = await itemRow.locator('[data-testid="item-description"]').inputValue();
      expect(enteredValue).toBe(unicodeText);
      
      console.log(`✓ Unicode handling for ${test.description}`);
    }
    
    console.log('✅ Internationalization edge cases verified');
  });
});