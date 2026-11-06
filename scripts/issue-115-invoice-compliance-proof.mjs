import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.BUSINESS_WEB_URL ?? 'http://127.0.0.1:8080';
const output = process.env.ISSUE115_DOCUMENT_OUTPUT ?? '/tmp/ledgercraft-issue115-invoices';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage(); page.setDefaultTimeout(90_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const results = { platform: 'Actual Chromium web/public invoice UI, desktop1440x900 and phone390x844; real Hono/SQLite HTTP seed', expected: { gross: '1150.00', subtotal: '1000.00', gst: '150.00', gstNumber: '49-098-576', buyerPhone: '021 555 0100' }, errors, documents: [] };
async function api(route, method = 'GET', body, status = 200) {
  const response = await context.request.fetch(`${origin}/api${route}`, { method, headers: { Origin: origin, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { data: body }) });
  const text = await response.text(); assert.equal(response.status(), status, `${method} ${route}: ${text}`);
  return text ? JSON.parse(text) : null;
}
const post = (route, body, status = 201) => api(route, 'POST', body, status);
const screenshot = async name => page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
try {
  results.build = await (await context.request.get(`${origin}/version.json`)).json();
  await post('/auth/sign-up/email', { name: 'GST document reviewer', email: `gst-docs-${Date.now()}@example.test`, password: `Local-${crypto.randomUUID()}!9` }, 200);
  await api('/business-profile', 'PUT', { name: 'Kauri GST Documents Limited', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered', taxId: '49098576', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'invoice', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3 });
  const buyer = await post('/customers', { name: 'Harbour Services Limited', email: '', phone: '021 555 0100' });
  const draft = await post('/invoices', { customerId: buyer.id, date: '2026-10-15', dueDate: '2026-11-15', currency: 'NZD', taxInclusive: true, taxRate: '15', items: [{ description: 'GST compliance consulting', quantity: '1', rate: '1150' }] });
  assert.equal(draft.total, '1150.00'); assert.equal(draft.subtotal, '1000.00'); assert.equal(draft.taxAmount, '150.00');
  assert.equal(draft.customerDetails.phone, '021 555 0100');
  const templates = ['classic', 'modern', 'minimal', 'executive', 'corporate', 'modernpro'];
  let originalToken;
  for (const [index, template] of templates.entries()) {
    const share = await post(`/invoices/${draft.id}/share`, { templateName: template });
    if (index === 0) originalToken = share.shareToken;
    await page.goto(`${origin}/shared/invoice/${share.shareToken}`, { waitUntil: 'networkidle' });
    await page.getByText(/^Tax invoice$/i).waitFor();
    await page.getByText('GST No: 49-098-576', { exact: true }).waitFor();
    await page.getByText('021 555 0100', { exact: true }).waitFor();
    await screenshot(`${String(index + 1).padStart(2, '0')}-${template}-tax-invoice-desktop.png`);
    results.documents.push({ template, title: 'Tax invoice', gstNumber: '49-098-576', buyerIdentifier: '021 555 0100', gross: draft.total, tax: draft.taxAmount });
    if (index === 0) {
      const download = page.waitForEvent('download', { timeout: 90_000 });
      await page.getByRole('button', { name: /Download PDF/i }).click();
      await (await download).saveAs(path.join(output, 'registered-tax-invoice.pdf'));
      const pdf = await readFile(path.join(output, 'registered-tax-invoice.pdf'));
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok((await stat(path.join(output, 'registered-tax-invoice.pdf'))).size > 1000);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/shared/invoice/${originalToken}`, { waitUntil: 'networkidle' });
  await page.getByText('GST No: 49-098-576', { exact: true }).waitFor();
  await screenshot('07-registered-tax-invoice-phone.png');

  const unidentified = await post('/customers', { name: 'Buyer needs identifier', email: '' });
  const small = await post('/invoices', { customerId: unidentified.id, date: '2026-10-15', dueDate: '2026-11-15', currency: 'NZD', taxInclusive: true, taxRate: '15', items: [{ description: 'GST-inclusive boundary services', quantity: '1', rate: '1000' }] });
  assert.equal(small.total, '1000.00');
  const rejected = await api(`/invoices/${small.id}`, 'PATCH', { items: [{ description: 'GST-inclusive boundary services', quantity: '1', rate: '1000.01' }], taxRate: '15' }, 422);
  assert.equal(rejected.error.code, 'GST_BUYER_DETAILS_REQUIRED');
  await page.goto(`${origin}/invoices/${small.id}/edit`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Save Changes', exact: true }).first().waitFor();
  assert.equal(await page.getByRole('alert').filter({ hasText: /buyer.*identifier/i }).count(), 0);
  await screenshot('08-inclusive-1000-boundary-phone.png');
  const saveResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/invoices/${small.id}`);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).first().click();
  const savedResponse = await saveResponse; assert.equal(savedResponse.status(), 200);
  const exactSaved = await savedResponse.json();
  assert.equal(exactSaved.total, '1000.00'); assert.equal(exactSaved.subtotal, '869.57'); assert.equal(exactSaved.taxAmount, '130.43'); assert.equal(exactSaved.taxInclusive, true);
  await page.goto(`${origin}/invoices/${small.id}/edit`, { waitUntil: 'networkidle' });
  const itemsToggle = page.getByRole('button', { name: 'Line Items', exact: true });
  if (await itemsToggle.getAttribute('aria-expanded') === 'false') await itemsToggle.click();
  await page.getByText('GST-inclusive boundary services', { exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByText('Rate', { exact: true }).locator('..').locator('input').fill('1000.01');
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /buyer.*identifier/i }).waitFor();
  await page.getByRole('button', { name: 'Edit buyer details in Customers', exact: true }).waitFor();
  await screenshot('09-buyer-information-required-phone.png');
  results.threshold = { at1000: small.total, actualUiSaved: { total: exactSaved.total, subtotal: exactSaved.subtotal, taxAmount: exactSaved.taxAmount, taxInclusive: exactSaved.taxInclusive }, over1000Code: rejected.error.code, originalRetained: (await api(`/invoices/${small.id}`)).total };
  assert.equal(results.threshold.originalRetained, '1000.00');

  await api('/business-profile', 'PUT', { name: 'Kauri GST Documents Limited', email: 'owner@example.test', country: 'NZ', gstRegistrationStatus: 'not_registered', taxId: null, gstRegisteredFrom: null, defaultTaxRate: '0' });
  const plain = await post('/invoices', { customerId: buyer.id, date: '2026-10-16', dueDate: '2026-11-16', currency: 'NZD', taxInclusive: true, taxRate: '0', items: [{ description: 'Non-registered supply', quantity: '1', rate: '100' }] });
  const plainShare = await post(`/invoices/${plain.id}/share`, { templateName: 'classic' });
  await page.goto(`${origin}/shared/invoice/${plainShare.shareToken}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'INVOICE', exact: true }).waitFor();
  assert.equal(await page.getByText(/GST No:/).count(), 0); assert.equal(await page.getByText(/^GST \(/).count(), 0);
  await screenshot('10-not-registered-invoice-phone.png');
  await page.goto(`${origin}/shared/invoice/${originalToken}`, { waitUntil: 'networkidle' });
  await page.getByText('GST No: 49-098-576', { exact: true }).waitFor();
  results.originalShareUnaffectedByLaterProfileChange = true;
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS: six tax-invoice templates/public buyer identifier/PDF; phone1000 vs1000.01 buyer fix-it; nonregistered document; original share snapshot unchanged; zero page errors');
} catch (error) {
  await screenshot('failure.png'); console.error((await page.locator('body').innerText()).slice(0, 6000)); throw error;
} finally { await browser.close(); }
