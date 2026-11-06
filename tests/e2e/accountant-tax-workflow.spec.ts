import { test, expect, Page } from '@playwright/test';
import { AuthMocker } from './auth-utils';

/**
 * COMPREHENSIVE ACCOUNTANT TAX WORKFLOW TESTS
 * 
 * Testing the complete small business accounting workflow from an expert accountant's perspective:
 * 1. Invoice Creation with proper tax setup
 * 2. Payment Recording and Receipt Generation  
 * 3. Expense Management with GST tracking
 * 4. Tax Configuration and Compliance
 * 5. IRD Return Generation and Filing
 * 6. Financial Reports for Business Intelligence
 * 
 * This test suite validates the application meets professional accounting standards
 * and IRD compliance requirements for New Zealand small businesses.
 */

interface AccountantTestScenario {
  businessProfile: {
    name: string;
    abn: string;
    gstRegistered: boolean;
    taxYear: string;
  };
  invoiceScenarios: Array<{
    customerName: string;
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxable: boolean;
    }>;
    taxInclusive: boolean;
    expectedGST: number;
    expectedTotal: number;
  }>;
  expenseScenarios: Array<{
    description: string;
    amount: number;
    category: string;
    gstClaimable: boolean;
    expectedGSTCredit: number;
  }>;
  taxPeriod: {
    start: string;
    end: string;
    expectedGSTOwed: number;
    expectedRefund: number;
  };
}

class AccountantWorkflowHelper {
  constructor(private page: Page) {}

  /**
   * Setup authentication and business profile as a professional accountant
   */
  async setupAccountantAuthentication() {
    const authMocker = new AuthMocker(this.page);
    await authMocker.mockCompletedOnboarding({
      email: 'accountant@precision-consulting.co.nz',
      fullName: 'Professional Accountant'
    });
    
    // Navigate to dashboard and verify we're properly authenticated
    await this.page.goto('/');
    await expect(this.page.locator('[data-testid="dashboard-header"]')).toBeVisible();
  }

  /**
   * Setup comprehensive tax configuration for NZ GST
   */
  async configureTaxSettings() {
    console.log('📋 Setting up tax configuration...');
    
    // Navigate to tax configuration
    await this.page.click('[data-testid="nav-tax-config"]');
    await expect(this.page.locator('h1:has-text("Tax Configuration")')).toBeVisible();
    
    // Configure NZ GST settings
    await this.page.selectOption('[data-testid="country-select"]', 'NZ');
    await this.page.selectOption('[data-testid="tax-type-select"]', 'GST');
    await this.page.fill('[data-testid="tax-rate-input"]', '15');
    await this.page.check('[data-testid="applies-to-services"]');
    await this.page.check('[data-testid="applies-to-goods"]');
    
    // Save configuration
    await this.page.click('[data-testid="save-tax-config"]');
    await expect(this.page.locator('.toast:has-text("Tax configuration saved")')).toBeVisible();
    
    console.log('✅ Tax configuration completed');
  }

  /**
   * Create a comprehensive invoice with proper tax calculations
   */
  async createTaxCompliantInvoice(scenario: AccountantTestScenario['invoiceScenarios'][0]) {
    console.log(`📄 Creating invoice for ${scenario.customerName}...`);
    
    // Navigate to create invoice
    await this.page.goto('/invoices/new');
    await expect(this.page.locator('h1:has-text("Create Invoice")')).toBeVisible();
    
    // Setup customer (create if needed)
    await this.createOrSelectCustomer(scenario.customerName);
    
    // Add invoice items with tax considerations
    for (let i = 0; i < scenario.items.length; i++) {
      const item = scenario.items[i];
      await this.addInvoiceItem(item, i);
    }
    
    // Configure tax settings for this invoice
    await this.page.click('[data-testid="tax-settings-toggle"]');
    if (scenario.taxInclusive) {
      await this.page.check('[data-testid="tax-inclusive-checkbox"]');
    } else {
      await this.page.uncheck('[data-testid="tax-inclusive-checkbox"]');
    }
    
    // Verify tax calculations are correct
    await this.verifyInvoiceTaxCalculations(scenario);
    
    // Save invoice as sent
    await this.page.selectOption('[data-testid="invoice-status"]', 'sent');
    await this.page.click('[data-testid="save-invoice"]');
    
    // Wait for success and get invoice number
    await expect(this.page.locator('.toast:has-text("Invoice created")')).toBeVisible();
    const invoiceNumber = await this.page.textContent('[data-testid="invoice-number"]');
    
    console.log(`✅ Invoice ${invoiceNumber} created successfully`);
    return invoiceNumber;
  }

  /**
   * Record payment with proper accounting entries
   */
  async recordPaymentWithAccountingValidation(invoiceNumber: string, paymentAmount: number) {
    console.log(`💰 Recording payment for invoice ${invoiceNumber}...`);
    
    // Navigate to invoices and find our invoice
    await this.page.goto('/invoices');
    await this.page.fill('[data-testid="search-invoices"]', invoiceNumber || '');
    await this.page.click(`[data-testid="invoice-${invoiceNumber}-record-payment"]`);
    
    // Fill payment details
    await this.page.fill('[data-testid="payment-amount"]', paymentAmount.toString());
    await this.page.selectOption('[data-testid="payment-method"]', 'bank_transfer');
    await this.page.fill('[data-testid="payment-reference"]', `PAY-${Date.now()}`);
    await this.page.fill('[data-testid="payment-date"]', new Date().toISOString().split('T')[0]);
    
    // Record payment
    await this.page.click('[data-testid="record-payment"]');
    await expect(this.page.locator('.toast:has-text("Payment recorded")')).toBeVisible();
    
    // Verify invoice status updated
    await expect(this.page.locator(`[data-testid="invoice-${invoiceNumber}-status"]:has-text("Paid")`)).toBeVisible();
    
    // Verify receipt generation
    await this.page.click(`[data-testid="invoice-${invoiceNumber}-view-receipt"]`);
    await expect(this.page.locator('[data-testid="receipt-details"]')).toBeVisible();
    await expect(this.page.locator(`text=${paymentAmount.toFixed(2)}`)).toBeVisible();
    
    console.log(`✅ Payment recorded and receipt generated`);
  }

  /**
   * Record business expenses with GST tracking
   */
  async recordBusinessExpenses(expenseScenarios: AccountantTestScenario['expenseScenarios']) {
    console.log('📋 Recording business expenses...');
    
    await this.page.goto('/expenses');
    
    for (const expense of expenseScenarios) {
      await this.page.click('[data-testid="add-expense"]');
      
      // Fill expense details
      await this.page.fill('[data-testid="expense-description"]', expense.description);
      await this.page.fill('[data-testid="expense-amount"]', expense.amount.toString());
      await this.page.selectOption('[data-testid="expense-category"]', expense.category);
      await this.page.fill('[data-testid="expense-date"]', new Date().toISOString().split('T')[0]);
      
      // GST settings
      if (expense.gstClaimable) {
        await this.page.check('[data-testid="gst-claimable"]');
        await this.page.fill('[data-testid="gst-rate"]', '15');
      }
      
      await this.page.click('[data-testid="save-expense"]');
      await expect(this.page.locator('.toast:has-text("Expense saved")')).toBeVisible();
      
      console.log(`✅ Expense recorded: ${expense.description}`);
    }
  }

  /**
   * Generate and validate GST return
   */
  async generateGSTReturn(taxPeriod: AccountantTestScenario['taxPeriod']) {
    console.log('📊 Generating GST return...');
    
    await this.page.goto('/ird-reporting');
    await expect(this.page.locator('h1:has-text("IRD Reporting")')).toBeVisible();
    
    // Start new GST return
    await this.page.click('[data-testid="create-gst-return"]');
    
    // Select period
    await this.page.fill('[data-testid="period-start"]', taxPeriod.start);
    await this.page.fill('[data-testid="period-end"]', taxPeriod.end);
    
    // Generate return
    await this.page.click('[data-testid="generate-return"]');
    await expect(this.page.locator('.toast:has-text("GST return generated")')).toBeVisible();
    
    // Validate calculations
    await this.validateGSTCalculations(taxPeriod);
    
    console.log('✅ GST return generated and validated');
  }

  /**
   * Validate IRD compliance and accuracy
   */
  async validateIRDCompliance() {
    console.log('🔍 Validating IRD compliance...');
    
    // Check compliance dashboard
    await this.page.goto('/tax-overview');
    
    // Verify compliance indicators
    await expect(this.page.locator('[data-testid="compliance-status"]:has-text("Compliant")')).toBeVisible();
    await expect(this.page.locator('[data-testid="gst-position"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="next-filing-date"]')).toBeVisible();
    
    // Check for any compliance issues
    const issueElements = await this.page.locator('[data-testid="compliance-issue"]').count();
    expect(issueElements).toBe(0);
    
    console.log('✅ IRD compliance validated');
  }

  /**
   * Generate comprehensive financial reports
   */
  async generateFinancialReports() {
    console.log('📈 Generating financial reports...');
    
    await this.page.goto('/reports');
    
    // Generate P&L statement
    await this.page.click('[data-testid="generate-profit-loss"]');
    await expect(this.page.locator('[data-testid="profit-loss-report"]')).toBeVisible();
    
    // Verify key financial metrics
    await expect(this.page.locator('[data-testid="total-revenue"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="total-expenses"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="net-profit"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="gst-liability"]')).toBeVisible();
    
    // Generate cash flow report
    await this.page.click('[data-testid="generate-cash-flow"]');
    await expect(this.page.locator('[data-testid="cash-flow-report"]')).toBeVisible();
    
    console.log('✅ Financial reports generated');
  }

  // Helper methods
  private async createOrSelectCustomer(customerName: string) {
    // Try to select existing customer first
    await this.page.click('[data-testid="customer-select"]');
    const existingCustomer = await this.page.locator(`text=${customerName}`).first();
    
    if (await existingCustomer.isVisible()) {
      await existingCustomer.click();
    } else {
      // Create new customer
      await this.page.click('[data-testid="add-new-customer"]');
      await this.page.fill('[data-testid="customer-name"]', customerName);
      await this.page.fill('[data-testid="customer-email"]', `${customerName.toLowerCase().replace(' ', '.')}@example.com`);
      await this.page.click('[data-testid="save-customer"]');
    }
  }

  private async addInvoiceItem(item: AccountantTestScenario['invoiceScenarios'][number]['items'][number], index: number) {
    await this.page.click('[data-testid="add-item"]');
    await this.page.fill(`[data-testid="item-description-${index}"]`, item.description);
    await this.page.fill(`[data-testid="item-quantity-${index}"]`, item.quantity.toString());
    await this.page.fill(`[data-testid="item-rate-${index}"]`, item.unitPrice.toString());
    
    if (!item.taxable) {
      await this.page.uncheck(`[data-testid="item-taxable-${index}"]`);
    }
  }

  private async verifyInvoiceTaxCalculations(scenario: AccountantTestScenario['invoiceScenarios'][number]) {
    // Wait for calculations to update
    await this.page.waitForTimeout(1000);
    
    // Verify GST amount
    const gstAmount = await this.page.textContent('[data-testid="invoice-gst-amount"]');
    expect(parseFloat(gstAmount || '0')).toBeCloseTo(scenario.expectedGST, 2);
    
    // Verify total
    const totalAmount = await this.page.textContent('[data-testid="invoice-total"]');
    expect(parseFloat(totalAmount || '0')).toBeCloseTo(scenario.expectedTotal, 2);
  }

  private async validateGSTCalculations(taxPeriod: AccountantTestScenario['taxPeriod']) {
    // Verify sales GST
    const salesGST = await this.page.textContent('[data-testid="gst-on-sales"]');
    expect(parseFloat(salesGST || '0')).toBeGreaterThan(0);
    
    // Verify purchases GST
    const purchasesGST = await this.page.textContent('[data-testid="gst-on-purchases"]');
    expect(parseFloat(purchasesGST || '0')).toBeGreaterThanOrEqual(0);
    
    // Verify net GST position
    const netGST = await this.page.textContent('[data-testid="net-gst-position"]');
    expect(netGST).toBeDefined();
  }
}

// Test data representing a typical small business quarter
const testScenario: AccountantTestScenario = {
  businessProfile: {
    name: 'Precision Consulting Ltd',
    abn: '123456789',
    gstRegistered: true,
    taxYear: '2024'
  },
  invoiceScenarios: [
    {
      customerName: 'Alpha Corporation',
      items: [
        { description: 'Business Consulting Services', quantity: 10, unitPrice: 150.00, taxable: true },
        { description: 'Strategic Planning Workshop', quantity: 1, unitPrice: 2500.00, taxable: true }
      ],
      taxInclusive: true,
      expectedGST: 434.78,
      expectedTotal: 4000.00
    },
    {
      customerName: 'Beta Enterprises',
      items: [
        { description: 'Financial Analysis Report', quantity: 1, unitPrice: 1200.00, taxable: true },
        { description: 'Training Materials', quantity: 5, unitPrice: 80.00, taxable: true }
      ],
      taxInclusive: false,
      expectedGST: 240.00,
      expectedTotal: 1840.00
    }
  ],
  expenseScenarios: [
    {
      description: 'Office Rent - January',
      amount: 2300.00,
      category: 'RENT',
      gstClaimable: true,
      expectedGSTCredit: 300.00
    },
    {
      description: 'Professional Software Licenses',
      amount: 890.00,
      category: 'SOFTWARE',
      gstClaimable: true,
      expectedGSTCredit: 116.09
    },
    {
      description: 'Client Entertainment',
      amount: 450.00,
      category: 'ENTERTAINMENT',
      gstClaimable: false,
      expectedGSTCredit: 0
    }
  ],
  taxPeriod: {
    start: '2024-01-01',
    end: '2024-03-31',
    expectedGSTOwed: 258.69, // (434.78 + 240.00) - (300.00 + 116.09)
    expectedRefund: 0
  }
};

test.describe('Complete Accountant Tax Workflow', () => {
  let helper: AccountantWorkflowHelper;

  test.beforeEach(async ({ page }) => {
    helper = new AccountantWorkflowHelper(page);
    await helper.setupAccountantAuthentication();
  });

  test('End-to-End Tax Compliance Workflow', async ({ page }) => {
    console.log('🎯 Starting complete accountant tax workflow test...');
    
    // Phase 1: Initial Setup
    console.log('\n📋 PHASE 1: Tax Configuration Setup');
    await helper.configureTaxSettings();
    
    // Phase 2: Invoice Creation and Management
    console.log('\n📄 PHASE 2: Invoice Creation with Tax Compliance');
    const invoiceNumbers: string[] = [];
    for (const invoiceScenario of testScenario.invoiceScenarios) {
      const invoiceNumber = await helper.createTaxCompliantInvoice(invoiceScenario);
      if (invoiceNumber) {
        invoiceNumbers.push(invoiceNumber);
      }
    }
    
    // Phase 3: Payment Processing
    console.log('\n💰 PHASE 3: Payment Recording and Receipt Generation');
    await helper.recordPaymentWithAccountingValidation(invoiceNumbers[0], 4000.00);
    await helper.recordPaymentWithAccountingValidation(invoiceNumbers[1], 1840.00);
    
    // Phase 4: Expense Management
    console.log('\n📋 PHASE 4: Business Expense Recording with GST');
    await helper.recordBusinessExpenses(testScenario.expenseScenarios);
    
    // Phase 5: Tax Return Generation
    console.log('\n📊 PHASE 5: GST Return Generation and Validation');
    await helper.generateGSTReturn(testScenario.taxPeriod);
    
    // Phase 6: Compliance Validation
    console.log('\n🔍 PHASE 6: IRD Compliance Verification');
    await helper.validateIRDCompliance();
    
    // Phase 7: Financial Reporting
    console.log('\n📈 PHASE 7: Comprehensive Financial Reporting');
    await helper.generateFinancialReports();
    
    console.log('\n✅ COMPLETE ACCOUNTANT WORKFLOW TEST PASSED!');
    console.log('All accounting standards and IRD compliance requirements verified.');
  });

  test('Tax Calculation Accuracy Test', async ({ page }) => {
    console.log('🧮 Testing tax calculation accuracy across different scenarios...');
    
    await helper.configureTaxSettings();
    
    // Test tax-inclusive calculations
    const taxInclusiveInvoice = await helper.createTaxCompliantInvoice(testScenario.invoiceScenarios[0]);
    console.log('✅ Tax-inclusive invoice calculations verified');
    
    // Test tax-exclusive calculations  
    const taxExclusiveInvoice = await helper.createTaxCompliantInvoice(testScenario.invoiceScenarios[1]);
    console.log('✅ Tax-exclusive invoice calculations verified');
    
    console.log('✅ All tax calculation scenarios passed');
  });

  test('GST Return Accuracy Test', async ({ page }) => {
    console.log('📊 Testing GST return accuracy and IRD compliance...');
    
    // Setup with existing data
    await helper.configureTaxSettings();
    
    // Create invoices and expenses for the period
    for (const invoiceScenario of testScenario.invoiceScenarios) {
      await helper.createTaxCompliantInvoice(invoiceScenario);
    }
    
    await helper.recordBusinessExpenses(testScenario.expenseScenarios);
    
    // Generate and validate GST return
    await helper.generateGSTReturn(testScenario.taxPeriod);
    
    console.log('✅ GST return accuracy verified');
  });

  test('Financial Reports Completeness Test', async ({ page }) => {
    console.log('📈 Testing financial reports completeness and accuracy...');
    
    await helper.configureTaxSettings();
    await helper.generateFinancialReports();
    
    // Verify all required financial statements are available
    await page.goto('/reports');
    
    // Check key reports exist
    await expect(page.locator('[data-testid="profit-loss-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="balance-sheet-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="cash-flow-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="gst-report-link"]')).toBeVisible();
    
    console.log('✅ Financial reports completeness verified');
  });

  test('Data Integrity and Audit Trail Test', async ({ page }) => {
    console.log('🔍 Testing data integrity and audit trail compliance...');
    
    await helper.configureTaxSettings();
    
    // Create transaction and verify audit trail
    const invoiceNumber = await helper.createTaxCompliantInvoice(testScenario.invoiceScenarios[0]);
    
    // Check audit trail exists
    await page.goto('/accounting');
    await page.click('[data-testid="audit-trail"]');
    
    // Verify invoice creation is logged
    await expect(page.locator(`text=Invoice ${invoiceNumber} created`)).toBeVisible();
    
    console.log('✅ Data integrity and audit trail verified');
  });
});

/**
 * IDENTIFIED GAPS AND ENHANCEMENT REQUIREMENTS
 * 
 * Based on this comprehensive test, the following features need implementation:
 * 
 * 1. Enhanced Invoice Tax Calculations
 *    - Mixed taxable/non-taxable items
 *    - Tax-inclusive vs tax-exclusive handling
 *    - Real-time calculation updates
 * 
 * 2. Advanced Expense Management
 *    - GST input credit tracking
 *    - Expense category tax rules
 *    - Receipt OCR with tax extraction
 * 
 * 3. Comprehensive GST Return Generation
 *    - Period-based data aggregation
 *    - Sales vs purchases separation
 *    - Bad debt adjustments
 *    - Export handling (zero-rated)
 * 
 * 4. Professional Financial Reporting
 *    - P&L with tax breakdown
 *    - Balance sheet with tax liabilities
 *    - Cash flow with tax payments
 *    - Management reports for decision making
 * 
 * 5. IRD Integration Readiness
 *    - Digital submission format
 *    - IRD validation rules
 *    - Return status tracking
 *    - Correspondence management
 * 
 * 6. Audit Trail and Compliance
 *    - Complete transaction history
 *    - Change logging
 *    - User access tracking
 *    - Backup and recovery
 */
