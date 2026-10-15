import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

test('Executive shared invoice fits a phone and downloads a long PDF with a logo', async ({ browser, baseURL }, testInfo) => {
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL)) throw new Error('Use a local test server');
  const artifacts = `/tmp/ledgercraft-verify-mobile-sharing/${testInfo.project.name}`;
  await mkdir(artifacts, { recursive: true });
  const owner = await browser.newContext({ baseURL });
  const recipient = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  try {
    const send = async (path: string, data: unknown, method = 'POST') => {
      const r = await owner.request.fetch(`/api/${path}`, { method, headers: { Origin: baseURL }, data });
      expect(r.ok(), await r.text()).toBeTruthy(); return r.json();
    };
    await send('auth/sign-up/email', { name: 'Mobile Invoice Verification', email: `mobile-${Date.now()}-${testInfo.project.name}@example.com`, password: 'Local-mobile-verification-123!' });
    const logoUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"><rect width="3000" height="3000" fill="#5B72EE"/><text x="1500" y="1700" text-anchor="middle" font-family="Arial" font-size="700" fill="white">TEST</text></svg>');
    await send('business-profile', { name: 'Artisan Catering Mobile Verification', address: '4, 26 Botany Road, Howick, Auckland, 2010', country: 'NZ', email: 'verification@example.com', logoUrl, bankAccountName: 'Verification Account', bankAccountNumber: '00-0000-0000000-00' }, 'PUT');
    const customer = await send('customers', { name: 'Mobile Test Customer', email: 'mobile-customer@example.com', country: 'NZ' });
    const invoice = await send('invoices', { customerId: customer.id, date: '2026-09-15', dueDate: '2026-10-15', currency: 'NZD', taxRate: '15', taxInclusive: false, items: Array.from({length: 35}, (_, index) => ({ description: `Item ${index + 1} — Mini chicken sandwiches for the catering event`, quantity: '30', unit: 'each', rate: '1.5', rateUnit: 'each' })), notes: 'FINAL INVOICE NOTES: Thank you for your order.', terms: 'Payment due in 30 days.' });
    const share = await send(`invoices/${invoice.id}/share`, { templateName: 'executive' });
    const page = await recipient.newPage();
    page.setDefaultTimeout(20000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/shared/invoice/${share.shareToken}`);
    await expect(page.getByText('Mobile Test Customer', { exact: true })).toBeVisible();
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('[aria-label="Dismiss update prompt"]')?.click());
    const bounds = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, tableWidth: document.querySelector('table')!.getBoundingClientRect().width, button: document.querySelector('button')!.getBoundingClientRect().toJSON() }));
    expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width);
    expect(bounds.tableWidth).toBeLessThan(bounds.width);
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeInViewport();
    await page.screenshot({ path: `${artifacts}/mobile.png`, fullPage: true });
    const pending = page.waitForEvent('download', { timeout: 60000 });
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const download = await pending;
    const path = `${artifacts}/${download.suggestedFilename()}`;
    await download.saveAs(path);
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(10000);
    expect(bytes.toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
    expect(errors).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${artifacts}/desktop.png`, fullPage: true });
  } finally { await owner.close(); await recipient.close(); }
});
