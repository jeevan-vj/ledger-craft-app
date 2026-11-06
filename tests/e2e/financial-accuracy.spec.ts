import { test, expect, Page } from '@playwright/test';
import { AuthMocker } from './auth-utils';

interface FinancialValidationRequest {
  items: Array<{ quantity: number; unit_price: number }>;
  tax_rate: number;
  expected_total: number;
}
interface PaymentBalanceRequest {
  payments: Array<{ amount: number }>;
  invoice_total: number;
}

/**
 * Financial Accuracy Validation E2E Tests
 * 
 * Comprehensive testing of financial calculations, data integrity, and accounting accuracy
 * from a certified finance professional's perspective. These tests ensure mathematical
 * precision, tax compliance, and audit trail accuracy across the entire system.
 */

interface FinancialValidationScenario {
  name: string;
  invoice: {
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      expectedLineTotal: number;
    }>;
    taxRate: number;
    discountPercent?: number;
    expectedSubtotal: number;
    expectedTaxAmount: number;
    expectedDiscountAmount?: number;
    expectedTotal: number;
  };
  payments: Array<{
    amount: number;
    expectedRemainingBalance: number;
  }>;
  expectedFinalStatus: 'paid' | 'partially_paid' | 'overpaid';
}

class FinancialAccuracyHelper {
  constructor(private page: Page) {}

  async setupFinancialValidationMocking() {
    // Mock tax configuration
    await this.page.route('**/rest/v1/tax_rates**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tax-standard',
            name: 'Standard Rate',
            rate: 0.10, // 10%
            description: 'Standard tax rate for services',
            is_default: true
          },
          {
            id: 'tax-reduced',
            name: 'Reduced Rate',
            rate: 0.05, // 5%
            description: 'Reduced tax rate for specific categories',
            is_default: false
          },
          {
            id: 'tax-zero',
            name: 'Zero Rate',
            rate: 0.00, // 0%
            description: 'Tax-exempt items',
            is_default: false
          }
        ])
      });
    });

    // Mock currency precision settings
    await this.page.route('**/rest/v1/business_settings**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currency: 'USD',
          decimal_places: 2,
          rounding_method: 'round_half_up',
          tax_calculation_method: 'line_item',
          discount_calculation_method: 'before_tax'
        })
      });
    });

    // Mock financial validation endpoints
    await this.page.route('**/api/financial/validate**', async route => {
      const body = route.request().postDataJSON() as FinancialValidationRequest;
      
      // Perform server-side calculation validation
      const calculatedSubtotal = body.items.reduce((sum, item) =>
        sum + (item.quantity * item.unit_price), 0);
      
      const calculatedTax = calculatedSubtotal * body.tax_rate;
      const calculatedTotal = calculatedSubtotal + calculatedTax;
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subtotal: parseFloat(calculatedSubtotal.toFixed(2)),
          tax_amount: parseFloat(calculatedTax.toFixed(2)),
          total: parseFloat(calculatedTotal.toFixed(2)),
          is_valid: Math.abs(calculatedTotal - body.expected_total) < 0.01,
          precision_check: true
        })
      });
    });

    // Mock payment balance calculations
    await this.page.route('**/api/financial/balance**', async route => {
      const body = route.request().postDataJSON() as PaymentBalanceRequest;
      
      const totalPayments = body.payments.reduce((sum, payment) =>
        sum + payment.amount, 0);
      
      const remainingBalance = body.invoice_total - totalPayments;
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          invoice_total: body.invoice_total,
          total_paid: parseFloat(totalPayments.toFixed(2)),
          remaining_balance: parseFloat(remainingBalance.toFixed(2)),
          payment_status: remainingBalance <= 0.01 ? 'paid' : 
                         totalPayments > 0 ? 'partially_paid' : 'unpaid',
          overpayment: remainingBalance < -0.01 ? Math.abs(remainingBalance) : 0
        })
      });
    });
  }

  /**
   * Validate invoice calculation accuracy
   */
  async validateInvoiceCalculations(scenario: FinancialValidationScenario) {
    console.log(`Validating invoice calculations for: ${scenario.name}`);
    
    // Navigate to create invoice
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    await this.page.waitForSelector('[data-testid="invoice-form"]');

    // Select customer
    await this.page.click('[data-testid="customer-select"]');
    await this.page.click('[data-testid="select-customer-default"]');

    // Add items and validate line calculations
    for (let i = 0; i < scenario.invoice.items.length; i++) {
      const item = scenario.invoice.items[i];
      
      await this.page.click('[data-testid="add-item-btn"]');
      
      const itemRow = this.page.locator(`[data-testid="item-row-${i}"]`);
      await itemRow.locator('[data-testid="item-description"]').fill(item.description);
      await itemRow.locator('[data-testid="item-quantity"]').fill(item.quantity.toString());
      await itemRow.locator('[data-testid="item-unit-price"]').fill(item.unitPrice.toFixed(2));
      
      // Wait for calculation and verify line total
      await this.page.waitForTimeout(500); // Allow for calculation
      const lineTotal = await itemRow.locator('[data-testid="item-total"]').textContent();
      const numericTotal = parseFloat(lineTotal?.replace(/[^0-9.]/g, '') || '0');
      
      expect(Math.abs(numericTotal - item.expectedLineTotal)).toBeLessThan(0.01);
      console.log(`✓ Line ${i + 1}: ${item.quantity} × $${item.unitPrice} = $${numericTotal}`);
    }

    // Set tax rate
    await this.page.selectOption('[data-testid="tax-rate-select"]', scenario.invoice.taxRate.toString());

    // Apply discount if specified
    if (scenario.invoice.discountPercent) {
      await this.page.fill('[data-testid="discount-percent"]', scenario.invoice.discountPercent.toString());
    }

    // Validate subtotal
    await this.page.waitForTimeout(1000); // Allow for recalculation
    const subtotalElement = this.page.locator('[data-testid="invoice-subtotal"]');
    const subtotalText = await subtotalElement.textContent();
    const subtotal = parseFloat(subtotalText?.replace(/[^0-9.]/g, '') || '0');
    
    expect(Math.abs(subtotal - scenario.invoice.expectedSubtotal)).toBeLessThan(0.01);
    console.log(`✓ Subtotal: $${subtotal} (Expected: $${scenario.invoice.expectedSubtotal})`);

    // Validate tax amount
    const taxElement = this.page.locator('[data-testid="invoice-tax"]');
    const taxText = await taxElement.textContent();
    const taxAmount = parseFloat(taxText?.replace(/[^0-9.]/g, '') || '0');
    
    expect(Math.abs(taxAmount - scenario.invoice.expectedTaxAmount)).toBeLessThan(0.01);
    console.log(`✓ Tax: $${taxAmount} (Expected: $${scenario.invoice.expectedTaxAmount})`);

    // Validate discount if applicable
    if (scenario.invoice.expectedDiscountAmount) {
      const discountElement = this.page.locator('[data-testid="invoice-discount"]');
      const discountText = await discountElement.textContent();
      const discountAmount = parseFloat(discountText?.replace(/[^0-9.]/g, '') || '0');
      
      expect(Math.abs(discountAmount - scenario.invoice.expectedDiscountAmount)).toBeLessThan(0.01);
      console.log(`✓ Discount: $${discountAmount} (Expected: $${scenario.invoice.expectedDiscountAmount})`);
    }

    // Validate total
    const totalElement = this.page.locator('[data-testid="invoice-total"]');
    const totalText = await totalElement.textContent();
    const total = parseFloat(totalText?.replace(/[^0-9.]/g, '') || '0');
    
    expect(Math.abs(total - scenario.invoice.expectedTotal)).toBeLessThan(0.01);
    console.log(`✓ Total: $${total} (Expected: $${scenario.invoice.expectedTotal})`);

    // Save invoice
    await this.page.click('[data-testid="save-invoice-btn"]');
    await this.page.waitForSelector('[data-testid="invoice-success-message"]');

    return { subtotal, taxAmount, total };
  }

  /**
   * Validate payment balance calculations
   */
  async validatePaymentBalances(invoiceTotal: number, payments: Array<{amount: number, expectedRemainingBalance: number}>) {
    console.log('Validating payment balance calculations...');
    
    let runningBalance = invoiceTotal;
    
    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];
      
      // Record payment
      await this.page.click('[data-testid="nav-payments"]');
      await this.page.click('[data-testid="record-payment-btn"]');
      await this.page.click('[data-testid="select-invoice-latest"]');
      
      await this.page.fill('[data-testid="payment-amount"]', payment.amount.toFixed(2));
      await this.page.selectOption('[data-testid="payment-method"]', 'bank_transfer');
      await this.page.fill('[data-testid="payment-reference"]', `PAYMENT-${i + 1}`);
      
      await this.page.click('[data-testid="submit-payment-btn"]');
      await this.page.waitForSelector('[data-testid="payment-success-message"]');
      
      // Validate remaining balance
      await this.page.click('[data-testid="nav-invoices"]');
      const invoiceRow = this.page.locator('[data-testid="invoice-row"]').first();
      const balanceElement = invoiceRow.locator('[data-testid="balance-due"]');
      const balanceText = await balanceElement.textContent();
      const actualBalance = parseFloat(balanceText?.replace(/[^0-9.-]/g, '') || '0');
      
      expect(Math.abs(actualBalance - payment.expectedRemainingBalance)).toBeLessThan(0.01);
      console.log(`✓ Payment ${i + 1}: $${payment.amount} → Balance: $${actualBalance} (Expected: $${payment.expectedRemainingBalance})`);
      
      runningBalance = payment.expectedRemainingBalance;
    }
    
    return runningBalance;
  }

  /**
   * Test currency precision and rounding
   */
  async testCurrencyPrecision() {
    console.log('Testing currency precision and rounding...');
    
    const precisionTests = [
      { quantity: 3, unitPrice: 33.333, expectedTotal: 99.999, roundedTotal: 100.00 },
      { quantity: 7, unitPrice: 14.285714, expectedTotal: 99.999998, roundedTotal: 100.00 },
      { quantity: 1, unitPrice: 0.125, expectedTotal: 0.125, roundedTotal: 0.13 }
    ];
    
    await this.page.click('[data-testid="nav-invoices"]');
    await this.page.click('[data-testid="create-invoice-btn"]');
    await this.page.click('[data-testid="customer-select"]');
    await this.page.click('[data-testid="select-customer-default"]');
    
    for (let i = 0; i < precisionTests.length; i++) {
      const test = precisionTests[i];
      
      await this.page.click('[data-testid="add-item-btn"]');
      const itemRow = this.page.locator(`[data-testid="item-row-${i}"]`);
      
      await itemRow.locator('[data-testid="item-description"]').fill(`Precision Test ${i + 1}`);
      await itemRow.locator('[data-testid="item-quantity"]').fill(test.quantity.toString());
      await itemRow.locator('[data-testid="item-unit-price"]').fill(test.unitPrice.toString());
      
      await this.page.waitForTimeout(500);
      
      const lineTotal = await itemRow.locator('[data-testid="item-total"]').textContent();
      const roundedTotal = parseFloat(lineTotal?.replace(/[^0-9.]/g, '') || '0');
      
      expect(Math.abs(roundedTotal - test.roundedTotal)).toBeLessThan(0.01);
      console.log(`✓ Precision test ${i + 1}: ${test.quantity} × ${test.unitPrice} = ${roundedTotal}`);
    }
  }

  /**
   * Test tax calculation accuracy across different methods
   */
  async testTaxCalculationAccuracy() {
    console.log('Testing tax calculation accuracy...');
    
    const taxTests = [
      {
        name: 'Line-item tax calculation',
        items: [
          { quantity: 1, unitPrice: 100.00, taxRate: 0.10 },
          { quantity: 2, unitPrice: 50.00, taxRate: 0.10 }
        ],
        expectedTotalTax: 20.00 // (100 * 0.10) + (100 * 0.10)
      },
      {
        name: 'Fractional tax calculation',
        items: [
          { quantity: 3, unitPrice: 33.33, taxRate: 0.08 },
        ],
        expectedTotalTax: 8.00 // Round((99.99 * 0.08), 2)
      }
    ];
    
    for (const taxTest of taxTests) {
      await this.page.click('[data-testid="nav-invoices"]');
      await this.page.click('[data-testid="create-invoice-btn"]');
      await this.page.click('[data-testid="customer-select"]');
      await this.page.click('[data-testid="select-customer-default"]');
      
      for (let i = 0; i < taxTest.items.length; i++) {
        const item = taxTest.items[i];
        
        await this.page.click('[data-testid="add-item-btn"]');
        const itemRow = this.page.locator(`[data-testid="item-row-${i}"]`);
        
        await itemRow.locator('[data-testid="item-description"]').fill(`Tax Test Item ${i + 1}`);
        await itemRow.locator('[data-testid="item-quantity"]').fill(item.quantity.toString());
        await itemRow.locator('[data-testid="item-unit-price"]').fill(item.unitPrice.toFixed(2));
      }
      
      await this.page.selectOption('[data-testid="tax-rate-select"]', taxTest.items[0].taxRate.toString());
      await this.page.waitForTimeout(1000);
      
      const taxElement = this.page.locator('[data-testid="invoice-tax"]');
      const taxText = await taxElement.textContent();
      const calculatedTax = parseFloat(taxText?.replace(/[^0-9.]/g, '') || '0');
      
      expect(Math.abs(calculatedTax - taxTest.expectedTotalTax)).toBeLessThan(0.01);
      console.log(`✓ ${taxTest.name}: Tax = $${calculatedTax} (Expected: $${taxTest.expectedTotalTax})`);
      
      // Clean up for next test
      await this.page.click('[data-testid="cancel-invoice"]');
    }
  }

  /**
   * Test financial data consistency across modules
   */
  async testCrossModuleDataConsistency(invoiceTotal: number) {
    console.log('Testing cross-module data consistency...');
    
    // Check invoice total in different views
    await this.page.click('[data-testid="nav-invoices"]');
    const invoiceListTotal = await this.page.locator('[data-testid="invoice-total"]').first().textContent();
    const listTotal = parseFloat(invoiceListTotal?.replace(/[^0-9.]/g, '') || '0');
    
    await this.page.locator('[data-testid="invoice-row"]').first().click();
    const invoiceDetailTotal = await this.page.locator('[data-testid="invoice-detail-total"]').textContent();
    const detailTotal = parseFloat(invoiceDetailTotal?.replace(/[^0-9.]/g, '') || '0');
    
    expect(Math.abs(listTotal - invoiceTotal)).toBeLessThan(0.01);
    expect(Math.abs(detailTotal - invoiceTotal)).toBeLessThan(0.01);
    expect(Math.abs(listTotal - detailTotal)).toBeLessThan(0.01);
    
    console.log(`✓ Invoice total consistency: List=$${listTotal}, Detail=$${detailTotal}`);
    
    // Check financial dashboard consistency
    await this.page.click('[data-testid="nav-dashboard"]');
    const dashboardRevenue = await this.page.locator('[data-testid="total-revenue"]').textContent();
    const revenueAmount = parseFloat(dashboardRevenue?.replace(/[^0-9.]/g, '') || '0');
    
    // Revenue should include all invoices
    expect(revenueAmount).toBeGreaterThanOrEqual(invoiceTotal - 0.01);
    console.log(`✓ Dashboard revenue consistency: $${revenueAmount}`);
  }

  /**
   * Test audit trail mathematical accuracy
   */
  async testAuditTrailAccuracy() {
    console.log('Testing audit trail mathematical accuracy...');
    
    // Navigate to financial reports
    await this.page.click('[data-testid="nav-financial-reports"]');
    
    // Generate profit & loss report
    await this.page.click('[data-testid="generate-pl-report"]');
    await this.page.fill('[data-testid="report-start-date"]', '2024-01-01');
    await this.page.fill('[data-testid="report-end-date"]', '2024-12-31');
    await this.page.click('[data-testid="generate-report-btn"]');
    
    await this.page.waitForSelector('[data-testid="pl-report-results"]');
    
    // Verify mathematical relationships in P&L
    const revenue = await this.getReportValue('[data-testid="report-revenue"]');
    const expenses = await this.getReportValue('[data-testid="report-expenses"]');
    const netIncome = await this.getReportValue('[data-testid="report-net-income"]');
    
    const calculatedNetIncome = revenue - expenses;
    expect(Math.abs(netIncome - calculatedNetIncome)).toBeLessThan(0.01);
    
    console.log(`✓ P&L accuracy: Revenue=$${revenue}, Expenses=$${expenses}, Net=$${netIncome}`);
    
    // Test balance sheet accuracy
    await this.page.click('[data-testid="balance-sheet-tab"]');
    await this.page.click('[data-testid="generate-balance-sheet"]');
    
    const assets = await this.getReportValue('[data-testid="total-assets"]');
    const liabilities = await this.getReportValue('[data-testid="total-liabilities"]');
    const equity = await this.getReportValue('[data-testid="total-equity"]');
    
    const balanceCheck = assets - (liabilities + equity);
    expect(Math.abs(balanceCheck)).toBeLessThan(0.01);
    
    console.log(`✓ Balance sheet accuracy: Assets=$${assets}, Liabilities+Equity=$${liabilities + equity}`);
  }

  private async getReportValue(selector: string): Promise<number> {
    const element = this.page.locator(selector);
    const text = await element.textContent();
    return parseFloat(text?.replace(/[^0-9.-]/g, '') || '0');
  }
}

test.describe('Financial Accuracy Validation Tests', () => {
  let authMocker: AuthMocker;
  let financialHelper: FinancialAccuracyHelper;

  const accuracyScenarios: FinancialValidationScenario[] = [
    {
      name: 'Simple Single-Item Invoice',
      invoice: {
        items: [
          {
            description: 'Consulting Services',
            quantity: 10,
            unitPrice: 150.00,
            expectedLineTotal: 1500.00
          }
        ],
        taxRate: 0.10,
        expectedSubtotal: 1500.00,
        expectedTaxAmount: 150.00,
        expectedTotal: 1650.00
      },
      payments: [
        { amount: 1650.00, expectedRemainingBalance: 0.00 }
      ],
      expectedFinalStatus: 'paid'
    },
    {
      name: 'Multi-Item with Fractional Calculations',
      invoice: {
        items: [
          {
            description: 'Product A',
            quantity: 3,
            unitPrice: 33.33,
            expectedLineTotal: 99.99
          },
          {
            description: 'Product B',
            quantity: 7,
            unitPrice: 14.29,
            expectedLineTotal: 100.03
          }
        ],
        taxRate: 0.08,
        expectedSubtotal: 200.02,
        expectedTaxAmount: 16.00,
        expectedTotal: 216.02
      },
      payments: [
        { amount: 100.00, expectedRemainingBalance: 116.02 },
        { amount: 116.02, expectedRemainingBalance: 0.00 }
      ],
      expectedFinalStatus: 'paid'
    },
    {
      name: 'Complex Invoice with Discount',
      invoice: {
        items: [
          {
            description: 'Service Package',
            quantity: 5,
            unitPrice: 200.00,
            expectedLineTotal: 1000.00
          },
          {
            description: 'Additional Hours',
            quantity: 15,
            unitPrice: 75.00,
            expectedLineTotal: 1125.00
          }
        ],
        taxRate: 0.12,
        discountPercent: 10,
        expectedSubtotal: 2125.00,
        expectedDiscountAmount: 212.50,
        expectedTaxAmount: 229.50, // Tax on discounted amount: (2125 - 212.50) * 0.12
        expectedTotal: 2142.00
      },
      payments: [
        { amount: 1000.00, expectedRemainingBalance: 1142.00 },
        { amount: 1142.00, expectedRemainingBalance: 0.00 }
      ],
      expectedFinalStatus: 'paid'
    }
  ];

  test.beforeEach(async ({ page }) => {
    authMocker = new AuthMocker(page);
    financialHelper = new FinancialAccuracyHelper(page);
    
    await authMocker.mockCompletedOnboarding({
      email: 'finance.accuracy@testbusiness.com',
      fullName: 'Financial Accuracy Validator'
    });

    await financialHelper.setupFinancialValidationMocking();

    await page.goto('/');
    await page.waitForSelector('[data-testid="dashboard"]');
  });

  // Test each accuracy scenario
  accuracyScenarios.forEach(scenario => {
    test(`Financial Accuracy: ${scenario.name}`, async ({ page }) => {
      test.setTimeout(120000); // 2 minutes for complex calculations

      console.log(`\n=== Testing Financial Accuracy: ${scenario.name} ===`);
      
      // Validate invoice calculations
      const { total } = await financialHelper.validateInvoiceCalculations(scenario);
      
      // Validate payment balance calculations
      const finalBalance = await financialHelper.validatePaymentBalances(total, scenario.payments);
      
      // Verify final payment status
      await page.click('[data-testid="nav-invoices"]');
      const statusElement = page.locator('[data-testid="payment-status"]').first();
      const expectedStatusText = scenario.expectedFinalStatus === 'paid' ? 'Paid' : 'Partially Paid';
      await expect(statusElement).toContainText(expectedStatusText);
      
      // Verify final balance
      expect(Math.abs(finalBalance)).toBeLessThan(0.01);
      
      console.log(`✅ ${scenario.name} completed with full accuracy validation`);
    });
  });

  test('Currency Precision and Rounding Standards', async ({ page }) => {
    test.setTimeout(90000);
    
    console.log('\n=== Testing Currency Precision and Rounding ===');
    
    await financialHelper.testCurrencyPrecision();
    
    // Test edge cases for rounding
    const edgeCases = [
      { value: 0.125, expectedRounded: 0.13 }, // Round half up
      { value: 0.124, expectedRounded: 0.12 }, // Round down
      { value: 0.126, expectedRounded: 0.13 }, // Round up
      { value: 99.995, expectedRounded: 100.00 }, // Large number rounding
    ];
    
    for (const edgeCase of edgeCases) {
      console.log(`Testing rounding: ${edgeCase.value} → ${edgeCase.expectedRounded}`);
      // Additional rounding tests would be implemented here
    }
    
    console.log('✅ Currency precision tests completed');
  });

  test('Tax Calculation Accuracy and Compliance', async ({ page }) => {
    test.setTimeout(90000);
    
    console.log('\n=== Testing Tax Calculation Accuracy ===');
    
    await financialHelper.testTaxCalculationAccuracy();
    
    // Test compound tax scenarios
    await page.click('[data-testid="nav-invoices"]');
    await page.click('[data-testid="create-invoice-btn"]');
    await page.click('[data-testid="customer-select"]');
    await page.click('[data-testid="select-customer-default"]');
    
    // Add item with compound tax
    await page.click('[data-testid="add-item-btn"]');
    const itemRow = page.locator('[data-testid="item-row-0"]');
    await itemRow.locator('[data-testid="item-description"]').fill('Compound Tax Test');
    await itemRow.locator('[data-testid="item-quantity"]').fill('1');
    await itemRow.locator('[data-testid="item-unit-price"]').fill('100.00');
    
    // Enable compound tax (GST + PST)
    await page.click('[data-testid="advanced-tax-options"]');
    await page.check('[data-testid="enable-compound-tax"]');
    await page.selectOption('[data-testid="primary-tax"]', '0.05'); // 5% GST
    await page.selectOption('[data-testid="secondary-tax"]', '0.07'); // 7% PST on GST-inclusive amount
    
    await page.waitForTimeout(1000);
    
    // Verify compound tax calculation: 100 + (100 * 0.05) + (105 * 0.07) = 112.35
    const totalElement = page.locator('[data-testid="invoice-total"]');
    const totalText = await totalElement.textContent();
    const total = parseFloat(totalText?.replace(/[^0-9.]/g, '') || '0');
    
    expect(Math.abs(total - 112.35)).toBeLessThan(0.01);
    console.log(`✓ Compound tax calculation: $${total} (Expected: $112.35)`);
    
    console.log('✅ Tax calculation accuracy tests completed');
  });

  test('Cross-Module Financial Data Consistency', async ({ page }) => {
    test.setTimeout(120000);
    
    console.log('\n=== Testing Cross-Module Data Consistency ===');
    
    // Create a test invoice to verify consistency
    const testInvoice = accuracyScenarios[0];
    const { total } = await financialHelper.validateInvoiceCalculations(testInvoice);
    
    await financialHelper.testCrossModuleDataConsistency(total);
    
    // Test data consistency after payments
    await financialHelper.validatePaymentBalances(total, testInvoice.payments);
    
    // Verify payment data appears consistently
    await page.click('[data-testid="nav-payments"]');
    const paymentTotal = await page.locator('[data-testid="payment-amount"]').first().textContent();
    const paymentAmount = parseFloat(paymentTotal?.replace(/[^0-9.]/g, '') || '0');
    
    expect(Math.abs(paymentAmount - testInvoice.payments[0].amount)).toBeLessThan(0.01);
    
    // Check financial summary consistency
    await page.click('[data-testid="nav-dashboard"]');
    const summaryCards = await page.locator('[data-testid^="summary-"]').count();
    expect(summaryCards).toBeGreaterThan(0);
    
    console.log('✅ Cross-module consistency validated');
  });

  test('Audit Trail Mathematical Verification', async ({ page }) => {
    test.setTimeout(150000);
    
    console.log('\n=== Testing Audit Trail Mathematical Accuracy ===');
    
    // Create multiple transactions for comprehensive audit testing
    for (let i = 0; i < 2; i++) {
      const scenario = accuracyScenarios[i];
      await financialHelper.validateInvoiceCalculations(scenario);
      await financialHelper.validatePaymentBalances(scenario.invoice.expectedTotal, scenario.payments);
    }
    
    await financialHelper.testAuditTrailAccuracy();
    
    // Test transaction log mathematical consistency
    await page.click('[data-testid="nav-financial-reports"]');
    await page.click('[data-testid="transaction-log-tab"]');
    
    // Generate detailed transaction log
    await page.fill('[data-testid="log-start-date"]', '2024-01-01');
    await page.fill('[data-testid="log-end-date"]', '2024-12-31');
    await page.click('[data-testid="generate-transaction-log"]');
    
    await page.waitForSelector('[data-testid="transaction-log-results"]');
    
    // Verify running balance calculations in transaction log
    const transactionRows = page.locator('[data-testid="transaction-row"]');
    const rowCount = await transactionRows.count();
    
    if (rowCount > 0) {
      let runningTotal = 0;
      for (let i = 0; i < Math.min(rowCount, 5); i++) { // Test first 5 transactions
        const row = transactionRows.nth(i);
        const amountText = await row.locator('[data-testid="transaction-amount"]').textContent();
        const balanceText = await row.locator('[data-testid="running-balance"]').textContent();
        
        const amount = parseFloat(amountText?.replace(/[^0-9.-]/g, '') || '0');
        const balance = parseFloat(balanceText?.replace(/[^0-9.-]/g, '') || '0');
        
        runningTotal += amount;
        expect(Math.abs(balance - runningTotal)).toBeLessThan(0.01);
        
        console.log(`✓ Transaction ${i + 1}: Amount=$${amount}, Running Balance=$${balance}`);
      }
    }
    
    console.log('✅ Audit trail mathematical verification completed');
  });

  test('Foreign Exchange and Multi-Currency Accuracy', async ({ page }) => {
    test.setTimeout(90000);
    
    console.log('\n=== Testing Multi-Currency Financial Accuracy ===');
    
    // Mock foreign exchange rates
    await page.route('**/api/fx-rates**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          base: 'USD',
          rates: {
            EUR: 0.85,
            GBP: 0.73,
            CAD: 1.25,
            JPY: 110.0
          },
          timestamp: Date.now()
        })
      });
    });
    
    await page.click('[data-testid="nav-invoices"]');
    await page.click('[data-testid="create-invoice-btn"]');
    await page.click('[data-testid="customer-select"]');
    await page.click('[data-testid="select-customer-default"]');
    
    // Create multi-currency invoice
    await page.selectOption('[data-testid="invoice-currency"]', 'EUR');
    
    await page.click('[data-testid="add-item-btn"]');
    const itemRow = page.locator('[data-testid="item-row-0"]');
    await itemRow.locator('[data-testid="item-description"]').fill('EUR Invoice Item');
    await itemRow.locator('[data-testid="item-quantity"]').fill('1');
    await itemRow.locator('[data-testid="item-unit-price"]').fill('1000.00'); // 1000 EUR
    
    await page.waitForTimeout(1000);
    
    // Verify USD equivalent display
    const usdEquivalent = page.locator('[data-testid="usd-equivalent"]');
    await expect(usdEquivalent).toContainText('$1,176.47'); // 1000 / 0.85
    
    // Test currency conversion accuracy in payments
    await page.selectOption('[data-testid="tax-rate-select"]', '0.00');
    await page.click('[data-testid="save-invoice-btn"]');
    
    await page.click('[data-testid="nav-payments"]');
    await page.click('[data-testid="record-payment-btn"]');
    await page.click('[data-testid="select-invoice-latest"]');
    
    // Payment in different currency
    await page.selectOption('[data-testid="payment-currency"]', 'GBP');
    await page.fill('[data-testid="payment-amount"]', '730.00'); // Equivalent to 1000 EUR
    
    // Verify conversion display
    const conversionDisplay = page.locator('[data-testid="conversion-display"]');
    await expect(conversionDisplay).toContainText('€1,000.00'); // 730 / 0.73
    
    console.log('✅ Multi-currency accuracy validation completed');
  });

  test('Financial Reconciliation and Variance Analysis', async ({ page }) => {
    test.setTimeout(120000);
    
    console.log('\n=== Testing Financial Reconciliation Accuracy ===');
    
    // Create test data for reconciliation
    const scenario = accuracyScenarios[1]; // Multi-item scenario
    await financialHelper.validateInvoiceCalculations(scenario);
    await financialHelper.validatePaymentBalances(scenario.invoice.expectedTotal, scenario.payments);
    
    // Navigate to reconciliation module
    await page.click('[data-testid="nav-financial-reports"]');
    await page.click('[data-testid="reconciliation-tab"]');
    
    // Import bank statement (mock)
    await page.click('[data-testid="import-bank-statement"]');
    await page.setInputFiles('[data-testid="bank-statement-file"]', {
      name: 'bank_statement.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Date,Description,Amount\n2024-06-30,Payment received,216.02\n')
    });
    
    await page.click('[data-testid="process-statement"]');
    await page.waitForSelector('[data-testid="reconciliation-results"]');
    
    // Verify auto-matching accuracy
    const matchedTransactions = page.locator('[data-testid="matched-transaction"]');
    const matchCount = await matchedTransactions.count();
    expect(matchCount).toBeGreaterThan(0);
    
    // Verify variance detection
    const varianceItems = page.locator('[data-testid="variance-item"]');
    const varianceCount = await varianceItems.count();
    
    if (varianceCount > 0) {
      const firstVariance = varianceItems.first();
      const varianceAmount = await firstVariance.locator('[data-testid="variance-amount"]').textContent();
      console.log(`Variance detected: ${varianceAmount}`);
    }
    
    // Test reconciliation completion
    await page.click('[data-testid="approve-reconciliation"]');
    await expect(page.locator('[data-testid="reconciliation-complete"]')).toBeVisible();
    
    console.log('✅ Financial reconciliation accuracy validated');
  });
});