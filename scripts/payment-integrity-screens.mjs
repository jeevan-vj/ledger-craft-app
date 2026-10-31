import { chromium } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const webUrl = process.env.PAYMENT_WEB_URL;
const outputDir = process.env.PAYMENT_OUTPUT_DIR;
const proofPassword = process.env.PAYMENT_PROOF_PASSWORD;
if (!webUrl || !outputDir || !proofPassword) {
  throw new Error('PAYMENT_WEB_URL, PAYMENT_OUTPUT_DIR, and PAYMENT_PROOF_PASSWORD are required');
}

const shots = [
  '01-partial-payments-desktop.png',
  '02-reversal-confirmation-desktop.png',
  '03-reversed-payment-desktop.png',
  '04-reversed-payment-mobile-web.png',
];
await mkdir(outputDir, { recursive: true });
await Promise.all(shots.map((name) => rm(path.join(outputDir, name), { force: true })));

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  timezoneId: 'Pacific/Auckland',
  locale: 'en-NZ',
});
const log = [];
const note = (line) => { console.log(line); log.push(line); };

async function api(pathname, { method = 'GET', body, expected = 200 } = {}) {
  const response = await context.request.fetch(`${webUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    data: body,
  });
  if (response.status() !== expected) {
    throw new Error(`${method} ${pathname} returned ${response.status()}, expected ${expected}: ${await response.text()}`);
  }
  return response.status() === 204 ? null : response.json();
}

async function capture(page, name) {
  await page.evaluate(() => document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
  await page.screenshot({ path: path.join(outputDir, name), animations: 'disabled', fullPage: true });
}

const email = `payment-proof-${Date.now()}@example.test`;
await api('/api/auth/sign-up/email', {
  method: 'POST',
  body: { name: 'Payment Proof Owner', email, password: proofPassword },
});
await api('/api/business-profile', {
  method: 'PUT',
  body: { name: 'Kauri Studio Ltd', email: 'owner@kauri.example', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered' },
});
const customer = await api('/api/customers', {
  method: 'POST', expected: 201,
  body: { name: 'North Harbour Cafe', email: 'accounts@northharbour.example', country: 'NZ' },
});
const invoice = await api('/api/invoices', {
  method: 'POST', expected: 201,
  body: {
    customerId: customer.id,
    date: '2026-10-25',
    dueDate: '2026-11-25',
    taxInclusive: false,
    taxRate: '15',
    items: [{ description: 'Brand identity', quantity: '1', rate: '4500.00' }],
  },
});
const first = await api('/api/payments', {
  method: 'POST', expected: 201,
  body: { invoiceId: invoice.id, paymentMethod: 'bank_transfer', amount: '1200.00', paymentDate: '2026-10-25', referenceNumber: 'REF-REV-1' },
});
await api('/api/payments', {
  method: 'POST', expected: 201,
  body: { invoiceId: invoice.id, paymentMethod: 'bank_transfer', amount: '500.00', paymentDate: '2026-10-26', referenceNumber: 'REF-KEEP-1' },
});
const overpay = await context.request.post(`${webUrl}/api/payments`, {
  data: { invoiceId: invoice.id, paymentMethod: 'bank_transfer', amount: '4000.00', paymentDate: '2026-10-26' },
});
note(`overpayment rejected: status=${overpay.status()} code=${(await overpay.json()).error.code}`);

const page = await context.newPage();
await page.goto(`${webUrl}/payments`, { waitUntil: 'networkidle' });
await page.getByRole('cell', { name: 'REF-REV-1' }).waitFor();
await capture(page, shots[0]);

const row = page.getByRole('row').filter({ hasText: 'REF-REV-1' });
await row.getByRole('button', { name: 'Payment actions' }).click();
await page.getByRole('menuitem', { name: 'Reverse payment' }).click();
await page.getByRole('heading', { name: 'Reverse payment' }).waitFor();
await page.getByLabel('Reversal date').fill('2026-10-31');
await page.getByLabel('Reason').fill('Payment entered against the wrong invoice');
await capture(page, shots[1]);
await page.getByRole('button', { name: 'Reverse payment', exact: true }).click();
await page.getByText('Payment entered against the wrong invoice').last().waitFor();
await page.getByText('Reversed', { exact: true }).last().waitFor();
await capture(page, shots[2]);

const after = await api(`/api/invoices/${invoice.id}`);
const reversed = await api(`/api/payments/${first.id}`);
note(`invoice after reversal: totalPaid=${after.totalPaid} balanceDue=${after.balanceDue} paymentStatus=${after.paymentStatus}`);
note(`payment after reversal: status=${reversed.status} reason=${JSON.stringify(reversed.reversalReason)} reversalDate=${reversed.reversalDate}`);

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'networkidle' });
await page.locator('p:visible').filter({ hasText: 'Payment entered against the wrong invoice' }).waitFor();
await capture(page, shots[3]);

await writeFile(path.join(outputDir, 'e2e-api-output.txt'), `${log.join('\n')}\n`);
await browser.close();
