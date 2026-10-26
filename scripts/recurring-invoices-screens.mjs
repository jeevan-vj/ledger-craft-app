// Issue #107 browser + API proof. Synthetic demo data only; no email key is configured.
import { chromium } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const webUrl = process.env.REC_WEB_URL;
const outputDir = process.env.REC_OUTPUT_DIR;
if (!webUrl || !outputDir) throw new Error('REC_WEB_URL and REC_OUTPUT_DIR are required');

const shots = ['01-editor-repeat-panel-preview.png', '02-monthly-31st-clamped.png', '03-recurring-page-rebuilt.png', '04-not-emailed-email-not-configured.png'];
await mkdir(outputDir, { recursive: true });
await Promise.all(shots.map((name) => rm(path.join(outputDir, name), { force: true })));

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Pacific/Auckland', locale: 'en-NZ' });
const log = [];
const note = (line) => { console.log(line); log.push(line); };

async function api(pathname, { method = 'GET', body, expected = 200 } = {}) {
  const response = await context.request.fetch(`${webUrl}${pathname}`, {
    method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, data: body,
  });
  if (response.status() !== expected) throw new Error(`${method} ${pathname} returned ${response.status()}, expected ${expected}: ${await response.text()}`);
  return response.status() === 204 ? null : response.json();
}
async function dismiss(page) { await page.evaluate(() => document.querySelector('[aria-label="Dismiss update prompt"]')?.click()); }
async function capture(page, name) { await dismiss(page); await page.screenshot({ path: path.join(outputDir, name), animations: 'disabled' }); }
async function pick(page, triggerLabel, optionName) {
  await page.getByRole('combobox', { name: triggerLabel }).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

// ---- Seed demo org ----
const email = `recurring-owner-${Date.now()}@example.test`;
await api('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Crystal Owner', email, password: 'Local-recurring-demo-123!' } });
await api('/api/business-profile', { method: 'PUT', body: { name: 'Crystal Touch Cleaning', email: 'owner@crystal.example', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered' } });
const me = await api('/api/me');
await api(`/api/organisations/${me.organisation.id}`, { method: 'PATCH', body: { name: 'Crystal Touch Cleaning' } });
const customer = await api('/api/customers', { method: 'POST', expected: 201, body: { name: 'Cleancorp Ltd', email: 'ap@cleancorp.example', country: 'NZ' } });
const customerId = customer.id ?? customer.customer?.id;
note(`Seeded org "Crystal Touch Cleaning" and customer "Cleancorp Ltd" (${customerId})`);
const health = await api('/api/healthz');
note(`healthz capabilities: ${JSON.stringify(health.capabilities ?? health)}`);

// ---- API E2E: create template, process due, reprocess ----
const template = await api('/api/recurring-templates', {
  method: 'POST', expected: 201,
  body: {
    name: 'Cleancorp monthly office clean',
    payload: {
      kind: 'invoice',
      input: { customerId, date: '2026-10-27', dueDate: '2026-11-20', items: [
        { description: 'Office clean - weekly x4', quantity: '4', rate: '250.00' },
        { description: 'Window wash', quantity: '1', rate: '120.00' },
      ] },
      send: { mode: 'auto', whenEmailUnavailable: 'draft' },
    },
    schedule: { frequency: 'monthly', interval: 1, startDate: '2026-10-27', timezone: 'Pacific/Auckland', localTime: '09:00', dayOfMonth: 27 },
  },
});
note(`Created template ${template.id}; nextRunAt=${template.nextRunAt}`);
const markSent = await api('/api/recurring-templates', {
  method: 'POST', expected: 201,
  body: {
    name: 'Cleancorp monthly window wash (mark as sent when email unavailable)',
    payload: {
      kind: 'invoice',
      input: { customerId, date: '2026-10-27', dueDate: '2026-11-20', items: [{ description: 'Window wash', quantity: '1', rate: '115.00' }] },
      send: { mode: 'auto', whenEmailUnavailable: 'mark_sent' },
    },
    schedule: { frequency: 'monthly', interval: 1, startDate: '2026-10-27', timezone: 'Pacific/Auckland', localTime: '09:00', dayOfMonth: 27 },
  },
});
note(`Created template ${markSent.id} (whenEmailUnavailable=mark_sent); nextRunAt=${markSent.nextRunAt}`);
const now = '2026-10-27T00:00:00.000Z'; // 13:00 NZDT, after the 09:00 NZDT occurrence
const first = await api('/api/recurring-runs/process', { method: 'POST', body: { now } });
note(`process #1 (now=${now}): ${JSON.stringify(first)}`);
const second = await api('/api/recurring-runs/process', { method: 'POST', body: { now } });
note(`process #2 (same now, idempotency): ${JSON.stringify(second)}`);
const runs = (await api('/api/recurring-runs')).runs.filter((run) => run.templateId === template.id || run.templateId === markSent.id);
note(`runs for both templates: ${runs.length}`);
for (const run of runs) note(`  run ${run.occurrenceKey} status=${run.status} generatedId=${run.generatedId} deliveryStatus=${run.deliveryStatus} deliveryMessage=${JSON.stringify(run.deliveryMessage)}`);
const invoiceList = await api('/api/invoices');
const invoices = (invoiceList.invoices ?? invoiceList.data ?? invoiceList).filter((inv) => (inv.customerId ?? inv.customer?.id) === customerId);
note(`invoices for Cleancorp Ltd: ${invoices.length}`);
for (const inv of invoices) note(`  invoice ${inv.invoiceNumber ?? inv.number} status=${inv.status} subtotal=${inv.subtotal} tax=${inv.taxAmount ?? inv.tax} total=${inv.total}`);
await writeFile(path.join(outputDir, 'e2e-api-output.txt'), `${log.join('\n')}\n`);

// ---- Screens ----
const page = await context.newPage();
await page.goto(`${webUrl}/invoices/new`, { waitUntil: 'networkidle' });
await dismiss(page);
const toggle = page.getByRole('switch', { name: 'Repeat this invoice' });
await toggle.scrollIntoViewIfNeeded();
await toggle.click();
await page.getByText('Next 5 dates').waitFor();
await page.getByText('Loading dates…').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
await page.getByText('Next 5 dates').evaluate((el) => el.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(800);
await capture(page, shots[0]);

await page.locator('#repeat-start-date').fill('2027-01-31');
await pick(page, 'Day of month', '31st');
await page.waitForTimeout(1200);
await page.getByText('Loading dates…').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
await page.getByText('Next 5 dates').scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const clamped = await page.locator('[aria-live="polite"] li').allTextContents();
note(`31st preview in editor: ${clamped.join(' | ')}`);
await capture(page, shots[1]);

await page.goto(`${webUrl}/recurring`, { waitUntil: 'networkidle' });
await dismiss(page);
await page.getByText('New schedule').first().waitFor();
// Show the rebuilt form: custom frequency + a second line item.
await page.locator('#schedule-name').fill('Cleancorp fortnightly deep clean');
await pick(page, 'Customer', 'Cleancorp Ltd').catch((error) => console.warn(`customer pick skipped: ${error.message}`));
await page.getByRole('button', { name: 'Add line' }).click().catch(() => {});
const descriptions = page.getByLabel('Description');
await descriptions.nth(0).fill('Deep clean - offices').catch(() => {});
await descriptions.nth(1).fill('Carpet shampoo').catch(() => {});
await page.waitForTimeout(500);
await capture(page, shots[2]);
const badge = page.getByText('Not emailed: email not configured').first();
await badge.waitFor({ timeout: 15000 });
await badge.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await capture(page, shots[3]);

await writeFile(path.join(outputDir, 'e2e-api-output.txt'), `${log.join('\n')}\n`);
await browser.close();
