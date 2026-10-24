import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

// Run against the local API with a disposable SQLite database and Vite on :8080.
// Enable all VITE_*_API flags listed in .env.example before starting Vite.
test('sender shares an invoice; a signed-out recipient views, reloads and downloads it', async ({ browser, baseURL }) => {
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL)) throw new Error('Use a local test server');
  const artifacts = '/tmp/ledgercraft-verify-sharing';
  await mkdir(artifacts, { recursive: true });
  const owner = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const recipient = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const send = async (path: string, data: unknown, method = 'POST') => {
    const result = await owner.request.fetch(`/api/${path}`, { method, headers: { Origin: baseURL }, data });
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  };
  try {
    await send('auth/sign-up/email', { name: 'Sharing verification', email: `sharing-${Date.now()}@example.com`, password: 'Local-sharing-test-123!' });
    await send('business-profile', { name: 'Kauri Studio Ltd', email: 'studio@example.com', country: 'NZ', defaultTaxRate: '15', bankAccountName: 'Kauri Studio Account', bankAccountNumber: '01-0123-0000123-00' }, 'PUT');
    const customer = await send('customers', { name: 'North Harbour Cafe', email: 'cafe@example.com', country: 'NZ' });
    const invoice = await send('invoices', {
      customerId: customer.id, date: '2026-09-15', dueDate: '2026-10-15', taxRate: '15', taxInclusive: false,
      items: [{ description: 'Design services', quantity: '1', rate: '100' }], notes: 'Thank you for your business', terms: 'Payment due in 30 days',
      additionalChargesList: [{ id: 'delivery', type: 'delivery', label: 'Delivery', calculationType: 'fixed', amount: '30', isActive: true }],
    });
    const sender = await owner.newPage();
    sender.setDefaultTimeout(15000);
    await sender.goto('/invoices');
    await sender.locator('[aria-label="Dismiss update prompt"]').click().catch(() => {});
    await sender.getByRole('button', { name: 'Share invoice', exact: true }).first().click();
    await sender.getByRole('button', { name: 'Generate Share Link' }).click();
    const linkInput = sender.getByLabel('Share Link', { exact: true });
    await expect(linkInput).toHaveValue(/\/shared\/invoice\//);
    const url = await linkInput.inputValue();
    await expect(sender.getByRole('link', { name: 'Open invoice' })).toHaveAttribute('href', url);
    await sender.screenshot({ path: `${artifacts}/sender.png`, fullPage: true });
    expect((await recipient.request.get('/api/me')).status()).toBe(401);
    const page = await recipient.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await expect(page.getByText('North Harbour Cafe', { exact: true })).toBeVisible();
    await expect(page.getByText('Kauri Studio Account', { exact: true })).toBeVisible();
    await expect(page.getByText('01-0123-0000123-00', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Delivery:?$/)).toBeVisible();
    await page.reload();
    await expect(page.getByText('North Harbour Cafe', { exact: true })).toBeVisible();
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('[aria-label="Dismiss update prompt"]')?.click());
    await page.screenshot({ path: `${artifacts}/recipient-desktop.png`, fullPage: true });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`Invoice-${invoice.invoiceNumber}.pdf`);
    const pdfPath = `${artifacts}/${download.suggestedFilename()}`;
    await download.saveAs(pdfPath);
    const bytes = await readFile(pdfPath);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(1024);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeInViewport();
    await page.screenshot({ path: `${artifacts}/recipient-mobile.png`, fullPage: true });
    const expired = await send(`invoices/${invoice.id}/share`, { replace: true, expiresAt: '2020-01-01T00:00:00.000Z' });
    await page.goto(`/shared/invoice/${expired.shareToken}`);
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('[aria-label="Dismiss update prompt"]')?.click());
    await expect(page.getByText('This link is no longer active', { exact: true })).toBeVisible();
    await expect(page.getByText('Failed to load invoice')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${artifacts}/recipient-inactive-mobile.png`, fullPage: true });
    await page.goto('/shared/invoice/invalid-token');
    await expect(page.getByText('Invoice Not Found', { exact: true })).toBeVisible();
  } finally {
    await owner.close();
    await recipient.close();
  }
});
