import { expect, test, type Page } from '@playwright/test';

/**
 * One Chrome pass for a GST-registered NZ business.
 *
 *   pnpm exec playwright test tests/e2e/accountant-books.spec.ts --project=chromium
 *
 * Uses the local Vite app on :8080 and a new account each run. No shared data.
 */

const password = 'Harbour-books-2026';

async function dismissChromeNoise(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss update prompt' });
  const box = await dismiss.boundingBox().catch(() => null);
  const viewport = page.viewportSize();
  if (!box || !viewport || box.y >= viewport.height || box.y + box.height <= 0) return;
  await dismiss.click();
}

test('a bookkeeper signs up, invoices, gets paid, and claims GST on a receipt', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Run with --project=chromium');
  test.setTimeout(180000);
  const email = `books.${Date.now()}@example.com`;
  const business = `Harbour Books ${Date.now()}`;

  await page.goto('/signup');
  await dismissChromeNoise(page);
  await page.getByRole('textbox', { name: 'Full name' }).fill('Harbour Books');
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('checkbox', { name: /terms of service/i }).check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'What is your business called?' })).toBeVisible();
  await page.getByTestId('onboarding-business-name').fill(business);
  await page.getByTestId('onboarding-gst-registered').click();
  await page.getByLabel('NZ GST number').fill('49-091-850');
  await page.getByLabel('GST registration date').fill('2024-04-01');
  await page.getByLabel('Accounting basis').selectOption({ label: 'Invoice basis' });
  await page.getByLabel('Filing frequency').selectOption({ label: 'Two-monthly' });
  await page.getByLabel('Period-ending month').selectOption({ label: 'March' });
  await dismissChromeNoise(page);
  await page.getByTestId('onboarding-submit').click();

  await expect(page.getByRole('button', { name: `Switch company. Current company ${business}` })).toBeVisible({ timeout: 20000 });

  await page.goto('/invoices/new');
  await dismissChromeNoise(page);
  await page.getByRole('button', { name: 'Add new customer' }).click();
  const customerDialog = page.getByRole('dialog');
  await customerDialog.getByLabel(/^name/i).fill('North Wharf Cafe');
  await customerDialog.getByLabel(/^email/i).fill('accounts@northwharf.test');
  await customerDialog.getByRole('button', { name: 'Create Customer' }).click();
  await expect(customerDialog).toBeHidden();
  await expect(page.getByText('North Wharf Cafe').first()).toBeVisible();

  await page.getByTestId('item-description-0').fill('Monthly bookkeeping');
  await page.getByTestId('item-quantity-0').fill('4');
  await page.getByTestId('item-rate-0').fill('150');
  await expect(page.getByTestId('invoice-subtotal')).toContainText('600.00');
  await expect(page.getByTestId('invoice-total')).toContainText('690.00');
  const invoiceNumber = await page.getByTestId('invoice-number').inputValue();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/\/invoices\/?$/);

  await page.goto('/payments');
  await dismissChromeNoise(page);
  await page.getByRole('button', { name: 'Record payment' }).click();
  await page.getByRole('button', { name: `Select invoice ${invoiceNumber}` }).click();
  const paymentDialog = page.getByRole('dialog', { name: 'Record Payment' });
  await paymentDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Bank Transfer' }).click();
  await paymentDialog.getByRole('button', { name: 'Record Payment' }).click();
  await expect(paymentDialog).toBeHidden();

  const invoice = await page.request.get('/api/invoices');
  expect(invoice.ok()).toBeTruthy();
  const invoiceBody = await invoice.json();
  const saved = (invoiceBody.invoices as Array<{ invoiceNumber: string; status: string; taxAmount: string; total: string; balanceDue: string }>).find((row) => row.invoiceNumber === invoiceNumber);
  expect(saved).toMatchObject({ status: 'paid', taxAmount: '90.00', total: '690.00', balanceDue: '0.00' });

  await page.goto('/expenses');
  await dismissChromeNoise(page);
  await page.getByRole('button', { name: 'Record expense' }).click();
  const expenseDrawer = page.getByRole('dialog', { name: 'Create Expense' });
  await expenseDrawer.getByLabel(/^description/i).fill('Stationery');
  await expenseDrawer.getByLabel(/^amount/i).fill('115');
  await expect(expenseDrawer.getByTestId('expense-gst-included')).toHaveText('GST included $15.00');
  await expenseDrawer.getByRole('button', { name: 'Create Expense' }).click();
  await expect(expenseDrawer).toBeHidden();

  const expenses = await page.request.get('/api/expenses');
  expect(expenses.ok()).toBeTruthy();
  const expenseBody = await expenses.json();
  const rows = (expenseBody.expenses ?? expenseBody) as Array<{ description: string; amount: string; taxAmount: string }>;
  expect(rows.find((row) => row.description === 'Stationery')).toMatchObject({ amount: '115.00', taxAmount: '15.00' });
});
