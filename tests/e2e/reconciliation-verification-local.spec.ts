import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve('docs/verification/reconciliation');

async function api(request: APIRequestContext, baseURL: string, route: string, data: unknown, method = 'POST') {
  const response = await request.fetch(`/api/${route}`, { method, headers: { Origin: baseURL }, data });
  const body = await response.text();
  expect(response.ok(), `${method} /api/${route} -> ${response.status()} ${body}`).toBeTruthy();
  return body ? JSON.parse(body) : {};
}

test('captures the server-backed reconciliation feed and match panel with demo data', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL)) throw new Error('Use a local test server');
  await mkdir(artifacts, { recursive: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const request = context.request;
  try {
    await api(request, baseURL, 'auth/sign-up/email', {
      name: 'Reconciliation Demo Owner',
      email: `reconciliation-demo-${Date.now()}@example.com`,
      password: 'Local-reconciliation-demo-123!',
    });
    await api(request, baseURL, 'business-profile', {
      name: 'Kowhai Workshop Ltd', email: 'accounts@example.com', country: 'NZ', defaultTaxRate: '0',
    }, 'PUT');
    const bank = await api(request, baseURL, 'bank-accounts', {
      accountName: 'Everyday Business', accountNumber: '00-0000-0000000-00', bankName: 'Demo Bank', accountType: 'checking', currency: 'NZD', openingBalance: '0', currentBalance: '0', isActive: true,
    });
    const ledgerAccounts = await api(request, baseURL, 'accounts/initialize', {}, 'POST');
    await api(request, baseURL, 'bank-matching-rules', {
      descriptionContains: 'Northwind Studio', direction: 'credit', targetAccountId: ledgerAccounts.accounts[0].id, enabled: true,
    });
    const exactCustomer = await api(request, baseURL, 'customers', { name: 'Northwind Studio', email: 'northwind@example.com', country: 'NZ' });
    const partialCustomer = await api(request, baseURL, 'customers', { name: 'Harbour Coffee', email: 'harbour@example.com', country: 'NZ' });
    const exactInvoice = await api(request, baseURL, 'invoices', {
      customerId: exactCustomer.id, date: '2026-11-03', dueDate: '2026-11-20', taxRate: '0', taxInclusive: false,
      items: [{ description: 'Brand workshop', quantity: '1', rate: '230.00' }],
    });
    const partialInvoice = await api(request, baseURL, 'invoices', {
      customerId: partialCustomer.id, date: '2026-11-04', dueDate: '2026-11-21', taxRate: '0', taxInclusive: false,
      items: [{ description: 'Monthly support', quantity: '1', rate: '100.00' }],
    });
    await api(request, baseURL, `invoices/${exactInvoice.id}`, { status: 'sent' }, 'PATCH');
    await api(request, baseURL, `invoices/${partialInvoice.id}`, { status: 'sent' }, 'PATCH');
    await api(request, baseURL, 'bank-transactions', {
      bankAccountId: bank.id, transactionDate: '2026-11-05', description: 'Northwind Studio INV payment', reference: 'NW-230', amount: '230.00', type: 'credit', paymentMethod: 'bank_transfer',
    });
    await api(request, baseURL, 'bank-transactions', {
      bankAccountId: bank.id, transactionDate: '2026-11-06', description: 'Harbour Coffee deposit plus retainer', reference: 'HC-150', amount: '150.00', type: 'credit', paymentMethod: 'bank_transfer',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.goto('/reconciliation');
    await page.locator('[aria-label="Dismiss update prompt"]').click().catch(() => undefined);
    await expect(page.getByRole('heading', { name: 'Bank Reconciliation' })).toBeVisible();
    await expect(page.getByLabel('Status')).toContainText('Unreconciled');
    await expect(page.getByText('Northwind Studio INV payment')).toBeVisible();
    await expect(page.getByText('Harbour Coffee deposit plus retainer')).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, '02-transaction-feed-filters.png'), fullPage: true });

    await page.getByText('Northwind Studio INV payment').click();
    await expect(page.getByRole('button', { name: 'Accept suggestion' })).toBeVisible();
    await expect(page.getByText('90%').last()).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifacts, '03-one-tap-accept.png'), fullPage: true });
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByText('Harbour Coffee deposit plus retainer').click();
    await page.getByLabel('Search open invoices').fill('Harbour Coffee');
    await page.getByRole('button', { name: /INV-.*Harbour Coffee/ }).click();
    await expect(page.getByText('$50.00').last()).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, '01-match-panel-amount-left.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
