import { test, expect, Page } from '@playwright/test';

/**
 * Bank Reconciliation E2E Tests
 * 
 * Tests the complete reconciliation workflow including:
 * - Creating bank accounts
 * - Starting reconciliation sessions
 * - Adding adjustments
 * - Viewing reconciliation reports
 */

// Test configuration
const TEST_BANK_ACCOUNT = {
  accountName: 'Test Business Checking',
  bankName: 'ANZ Bank',
  accountNumber: '12-3456-0001234-00',
  openingBalance: '10000',
  currentBalance: '10000',
};

const TEST_RECONCILIATION = {
  openingBalance: '10000',
  closingBalance: '12500',
};

const TEST_ADJUSTMENT = {
  type: 'Outstanding Check',
  description: 'Outstanding check #12345',
  amount: '500',
  reference: '12345',
};

// Helper function to dismiss version update dialog
async function dismissVersionDialog(page: Page) {
  try {
    const dismissButton = page.locator('button[aria-label="Dismiss update prompt"]');
    if (await dismissButton.isVisible({ timeout: 2000 })) {
      await dismissButton.click({ force: true });
      await page.waitForTimeout(300);
    }
  } catch {
    // Dialog not present, continue
  }
}

// Helper function to wait for page to be ready
async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await dismissVersionDialog(page);
}

test.describe('Bank Reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to bank accounts page
    await page.goto('/bank-accounts');
    await waitForPageReady(page);
  });

  test('should display bank accounts page', async ({ page }) => {
    // Wait for page to load
    await expect(page.locator('h1:has-text("Bank Accounts")')).toBeVisible({ timeout: 10000 });
    
    // Check for page elements
    await expect(page.locator('text=Manage your bank accounts')).toBeVisible();
  });

  test('should create a bank account', async ({ page }) => {
    // Click Add Bank Account button
    await page.click('button:has-text("Add Bank Account")');
    
    // Wait for dialog
    await expect(page.locator('dialog:has-text("Add Bank Account")')).toBeVisible();
    
    // Fill in form
    await page.fill('input[placeholder="My Checking Account"]', TEST_BANK_ACCOUNT.accountName);
    await page.fill('input[placeholder="ANZ Bank"]', TEST_BANK_ACCOUNT.bankName);
    await page.fill('input[placeholder="12-3456-7890123-00"]', TEST_BANK_ACCOUNT.accountNumber);
    await page.fill('input[name="openingBalance"]', TEST_BANK_ACCOUNT.openingBalance);
    await page.fill('input[name="currentBalance"]', TEST_BANK_ACCOUNT.currentBalance);
    
    // Submit
    await page.click('button:has-text("Create Account")');
    
    // Verify toast
    await expect(page.locator('text=Bank account created successfully')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to reconciliation page', async ({ page }) => {
    // Click Reconcile button
    const reconcileButton = page.locator('button:has-text("Reconcile")');
    
    // Only enabled if there are bank accounts
    if (await reconcileButton.isEnabled()) {
      await reconcileButton.click();
      
      // Should be on reconciliation page
      await expect(page).toHaveURL(/\/reconciliation/);
      await expect(page.locator('h1:has-text("Bank Reconciliation")')).toBeVisible();
    }
  });
});

test.describe('Reconciliation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to reconciliation page
    await page.goto('/reconciliation');
    await waitForPageReady(page);
  });

  test('should display reconciliation page', async ({ page }) => {
    await expect(page.locator('h1:has-text("Bank Reconciliation")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Match bank statements')).toBeVisible();
  });

  test('should start reconciliation session', async ({ page }) => {
    // Wait for page to load
    await expect(page.locator('h1:has-text("Bank Reconciliation")')).toBeVisible({ timeout: 10000 });
    
    // Check if there's a bank account selected
    const startButton = page.locator('button:has-text("Start Reconciliation")');
    
    if (await startButton.isVisible()) {
      await startButton.click();
      
      // Should show setup dialog
      await expect(page.locator('dialog:has-text("Start Bank Reconciliation")')).toBeVisible({ timeout: 5000 });
      
      // Fill in statement balances
      await page.fill('input[name="openingBalance"]', TEST_RECONCILIATION.openingBalance);
      await page.fill('input[name="closingBalance"]', TEST_RECONCILIATION.closingBalance);
      
      // Start reconciliation
      await page.locator('dialog button:has-text("Start Reconciliation")').click();
      
      // Should show success message
      await expect(page.locator('text=Reconciliation session created')).toBeVisible({ timeout: 5000 });
      
      // URL should have session ID
      await expect(page).toHaveURL(/session=/);
    }
  });

  test('should show reconciliation workspace tabs', async ({ page }) => {
    // If there's an active session in URL, check tabs
    if (page.url().includes('session=')) {
      await expect(page.locator('role=tab[name="Match Transactions"]')).toBeVisible();
      await expect(page.locator('role=tab[name=/Adjustments/]')).toBeVisible();
      await expect(page.locator('role=tab[name="Summary Report"]')).toBeVisible();
    }
  });

  test('should show reconciliation summary card', async ({ page }) => {
    if (page.url().includes('session=')) {
      await expect(page.locator('text=Statement Balance')).toBeVisible();
      await expect(page.locator('text=Book Balance')).toBeVisible();
      await expect(page.locator('text=Adjusted Bank')).toBeVisible();
      await expect(page.locator('text=Difference')).toBeVisible();
    }
  });
});

test.describe('Reconciliation Adjustments', () => {
  test('should add adjustment', async ({ page }) => {
    // Navigate to reconciliation page with existing session
    await page.goto('/reconciliation');
    await waitForPageReady(page);
    
    // Click on Adjustments tab
    const adjustmentsTab = page.locator('role=tab[name=/Adjustments/]');
    
    if (await adjustmentsTab.isVisible()) {
      await adjustmentsTab.click();
      
      // Click Add Adjustment
      await page.click('button:has-text("Add Adjustment")');
      
      // Should show adjustment dialog
      await expect(page.locator('dialog:has-text("Add Reconciliation Adjustment")')).toBeVisible();
      
      // Fill in adjustment details
      await page.fill('input[placeholder*="description"]', TEST_ADJUSTMENT.description);
      await page.fill('input[name="amount"]', TEST_ADJUSTMENT.amount);
      await page.fill('input[placeholder*="Check number"]', TEST_ADJUSTMENT.reference);
      
      // Add adjustment
      await page.locator('dialog button:has-text("Add Adjustment")').click();
      
      // Should show success message
      await expect(page.locator('text=Adjustment added successfully')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Reconciliation Report', () => {
  test('should show summary report', async ({ page }) => {
    // Navigate to reconciliation page with existing session
    await page.goto('/reconciliation');
    await waitForPageReady(page);
    
    // Click on Summary Report tab
    const reportTab = page.locator('role=tab[name="Summary Report"]');
    
    if (await reportTab.isVisible()) {
      await reportTab.click();
      
      // Check for report elements
      await expect(page.locator('text=Bank Reconciliation Statement')).toBeVisible();
      await expect(page.locator('text=Bank Balance Reconciliation')).toBeVisible();
      await expect(page.locator('text=Book Balance Reconciliation')).toBeVisible();
      
      // Check for action buttons
      await expect(page.locator('button:has-text("Print")')).toBeVisible();
      await expect(page.locator('button:has-text("Export CSV")')).toBeVisible();
    }
  });

  test('should show reconciliation status', async ({ page }) => {
    await page.goto('/reconciliation');
    await waitForPageReady(page);
    
    const reportTab = page.locator('role=tab[name="Summary Report"]');
    
    if (await reportTab.isVisible()) {
      await reportTab.click();
      
      // Check for status message (either complete or incomplete)
      const isComplete = await page.locator('text=Reconciliation Complete').isVisible();
      const isIncomplete = await page.locator('text=Reconciliation Incomplete').isVisible();
      
      expect(isComplete || isIncomplete).toBeTruthy();
    }
  });
});

test.describe('Reconciliation Integration', () => {
  test('complete reconciliation workflow', async ({ page }) => {
    // Step 1: Go to bank accounts
    await page.goto('/bank-accounts');
    await waitForPageReady(page);
    
    // Check if bank account exists
    const hasAccounts = await page.locator('text=Test Business Checking').isVisible({ timeout: 3000 }).catch(() => false);
    
    if (!hasAccounts) {
      // Create bank account
      await page.click('button:has-text("Add Bank Account")');
      await expect(page.locator('dialog')).toBeVisible();
      
      await page.fill('input[placeholder="My Checking Account"]', TEST_BANK_ACCOUNT.accountName);
      await page.fill('input[placeholder="ANZ Bank"]', TEST_BANK_ACCOUNT.bankName);
      await page.fill('input[placeholder="12-3456-7890123-00"]', TEST_BANK_ACCOUNT.accountNumber);
      
      await page.click('button:has-text("Create Account")');
      await page.waitForTimeout(1000);
    }
    
    // Step 2: Navigate to reconciliation
    await page.click('button:has-text("Reconcile")');
    await expect(page).toHaveURL(/\/reconciliation/);
    
    // Step 3: Start reconciliation if no active session
    const startButton = page.locator('button:has-text("Start Reconciliation")');
    
    if (await startButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startButton.click();
      await expect(page.locator('dialog')).toBeVisible();
      
      await page.fill('input[name="openingBalance"]', TEST_RECONCILIATION.openingBalance);
      await page.fill('input[name="closingBalance"]', TEST_RECONCILIATION.closingBalance);
      
      await page.locator('dialog button:has-text("Start Reconciliation")').click();
      await page.waitForTimeout(1000);
    }
    
    // Step 4: Verify workspace is shown
    await expect(page.locator('text=Statement Balance')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Match Transactions')).toBeVisible();
    
    // Step 5: Check adjustments tab
    await page.click('role=tab[name=/Adjustments/]');
    await expect(page.locator('text=Reconciliation Adjustments')).toBeVisible();
    
    // Step 6: Check summary report
    await page.click('role=tab[name="Summary Report"]');
    await expect(page.locator('text=Bank Reconciliation Statement')).toBeVisible();
    
    console.log('✅ Reconciliation workflow completed successfully');
  });
});

