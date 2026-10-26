import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const webUrl = process.env.PHASE3_WEB_URL;
const apiUrl = process.env.PHASE3_API_URL;
const outputDir = process.env.PHASE3_OUTPUT_DIR;
const fixtureDir = process.env.PHASE3_FIXTURE_DIR;

if (!webUrl || !apiUrl || !outputDir || !fixtureDir) {
  throw new Error('PHASE3_WEB_URL, PHASE3_API_URL, PHASE3_OUTPUT_DIR and PHASE3_FIXTURE_DIR are required');
}

const screenshots = [
  '01-upload-empty.png',
  '02-upload-drag.png',
  '03-processing.png',
  '04-review-original-beside-fields.png',
  '05-direction-third-party-warning.png',
  '06-low-confidence-photo.png',
  '07-duplicate-warning.png',
  '08-totals-mismatch-block.png',
  '09-committed-draft-invoice.png',
  '10-invoice-source-link.png',
  '11-bill-committed.png',
  '12-read-only-denied.png',
];

await mkdir(outputDir, { recursive: true });
await Promise.all(screenshots.map((name) => rm(path.join(outputDir, name), { force: true })));

// The full Chromium channel uses the new headless mode, including its PDF viewer.
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const viewport = { width: 1440, height: 900 };
const ownerContext = await browser.newContext({ viewport });
const readOnlyContext = await browser.newContext({ viewport });

async function api(context, pathname, { method = 'GET', body, expected = 200 } = {}) {
  const response = await context.request.fetch(`${webUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    data: body,
  });
  if (response.status() !== expected) {
    throw new Error(`${method} ${pathname} returned ${response.status()}, expected ${expected}: ${await response.text()}`);
  }
  if (response.status() === 204) return null;
  return response.json();
}

async function dismissUpdatePrompt(page) {
  await page.evaluate(() => document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
}

async function capture(page, name) {
  await dismissUpdatePrompt(page);
  await page.screenshot({ path: path.join(outputDir, name), animations: 'disabled' });
}

async function gotoImport(page) {
  await page.goto(`${webUrl}/invoices/import`, { waitUntil: 'networkidle' });
  await dismissUpdatePrompt(page);
  await page.getByRole('heading', { name: 'Import from file' }).waitFor();
}

async function uploadToReview(page, filename, { captureProcessing = false } = {}) {
  await gotoImport(page);
  let delayed = false;
  if (captureProcessing) {
    await page.route('**/api/invoice-imports/*/extract', async (route) => {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
  }
  await page.locator('input[type="file"][aria-label="Invoice file"]').setInputFiles(path.join(fixtureDir, filename));
  if (captureProcessing) {
    await page.getByText('Extracting fields and checking totals…').waitFor();
    await capture(page, '03-processing.png');
    if (!delayed) throw new Error('The extract route was not delayed for the processing-state screenshot');
  }
  await page.getByRole('heading', { name: 'Review extraction' }).waitFor({ timeout: 30_000 });
  if (captureProcessing) await page.unroute('**/api/invoice-imports/*/extract');
}

async function chooseDirection(page, label) {
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'PATCH' && /\/api\/invoice-imports\/[^/]+\/draft$/.test(new URL(candidate.url()).pathname));
  await page.getByText(label, { exact: true }).click();
  const result = await response;
  if (!result.ok()) throw new Error(`Direction PATCH failed with ${result.status()}`);
}

async function chooseContact(page, name) {
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'PATCH' && /\/api\/invoice-imports\/[^/]+\/draft$/.test(new URL(candidate.url()).pathname));
  await page.getByRole('combobox', { name: 'Customer or vendor' }).click();
  await page.getByRole('option', { name, exact: true }).click();
  const result = await response;
  if (!result.ok()) throw new Error(`Contact PATCH failed with ${result.status()}`);
}

async function setup() {
  const ownerEmail = `phase3-owner-${Date.now()}@example.test`;
  const readOnlyEmail = `phase3-read-only-${Date.now()}@example.test`;
  const password = 'Local-phase3-demo-123!';

  await api(ownerContext, '/api/auth/sign-up/email', {
    method: 'POST', expected: 200,
    body: { name: 'Crystal Owner', email: ownerEmail, password },
  });
  await api(ownerContext, '/api/business-profile', {
    method: 'PUT',
    body: {
      name: 'Crystal Touch Cleaning', email: 'owner@crystal.example', country: 'NZ',
      defaultTaxRate: '15', gstRegistrationStatus: 'registered',
    },
  });
  const owner = await api(ownerContext, '/api/me');
  await api(ownerContext, `/api/organisations/${owner.organisation.id}`, {
    method: 'PATCH', body: { name: 'Crystal Touch Cleaning' },
  });
  await api(ownerContext, '/api/customers', {
    method: 'POST', expected: 201,
    body: { name: 'Cleancorp Ltd', email: 'ap@cleancorp.example', country: 'NZ' },
  });
  await api(ownerContext, '/api/customers', {
    method: 'POST', expected: 201,
    body: { name: 'Harbour Cafe Ltd', email: 'accounts@harbour.example', country: 'NZ' },
  });
  await api(ownerContext, '/api/vendors', {
    method: 'POST', expected: 201,
    body: { name: 'Sparkle Supplies Ltd', email: 'accounts@sparkle.example' },
  });
  await api(ownerContext, '/api/vendors', {
    method: 'POST', expected: 201,
    body: { name: 'Kauri Office Supplies', email: 'billing@kauri.example' },
  });

  const invitation = await api(ownerContext, `/api/organisations/${owner.organisation.id}/invitations`, {
    method: 'POST', expected: 201,
    body: { email: readOnlyEmail, role: 'read_only' },
  });
  await api(readOnlyContext, '/api/auth/sign-up/email', {
    method: 'POST', expected: 200,
    body: { name: 'Read Only Reviewer', email: readOnlyEmail, password },
  });
  await api(readOnlyContext, '/api/invitations/accept', {
    method: 'POST', body: { token: invitation.acceptToken },
  });
}

try {
  await setup();
  const page = await ownerContext.newPage();

  await gotoImport(page);
  await capture(page, '01-upload-empty.png');

  await page.locator('button[aria-label="Choose an invoice PDF, JPG or PNG to import"]').dispatchEvent('dragenter', {
    dataTransfer: await page.evaluateHandle(() => new DataTransfer()),
  });
  await page.getByText('Drop an invoice or bill here').waitFor();
  await capture(page, '02-upload-drag.png');

  await uploadToReview(page, 'cleancorp-buyer-created-tax-invoice.pdf', { captureProcessing: true });
  await page.getByText('Mock extraction — demo data').waitFor();
  await page.waitForTimeout(3000);
  await capture(page, '04-review-original-beside-fields.png');

  await chooseDirection(page, 'Money in: Sales invoice');
  const thirdPartySwitch = page.getByRole('switch', { name: 'Issued by a third party' });
  if (!(await thirdPartySwitch.isChecked())) {
    const thirdPartyPatch = page.waitForResponse((candidate) => candidate.request().method() === 'PATCH' && /\/api\/invoice-imports\/[^/]+\/draft$/.test(new URL(candidate.url()).pathname));
    await thirdPartySwitch.click();
    if (!(await thirdPartyPatch).ok()) throw new Error('Third-party-issued PATCH failed');
  }
  await page.getByText(/issued this document on your behalf \(buyer-created\)/).waitFor();
  await capture(page, '05-direction-third-party-warning.png');

  await chooseContact(page, 'Cleancorp Ltd');
  const commit = page.getByRole('button', { name: 'Create draft invoice' });
  await commit.waitFor();
  if (await commit.isDisabled()) throw new Error('Create draft invoice stayed disabled after required review choices');
  await commit.click();
  await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 30_000 });
  await page.getByText('Source document', { exact: true }).waitFor();
  await page.getByText('Draft invoice created').waitFor();
  await capture(page, '09-committed-draft-invoice.png');
  await page.getByText('Source document', { exact: true }).scrollIntoViewIfNeeded();
  const invoiceToast = page.locator('[data-sonner-toast]');
  if (await invoiceToast.isVisible()) {
    await invoiceToast.hover();
    const close = invoiceToast.locator('[data-close-button]');
    if (await close.isVisible()) await close.click();
  }
  await page.getByRole('link', { name: 'Download original' }).focus();
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(250);
  await capture(page, '10-invoice-source-link.png');

  await uploadToReview(page, 'invoice-photo.jpg');
  await page.getByText(/Check this ·/).first().waitFor();
  await capture(page, '06-low-confidence-photo.png');

  await uploadToReview(page, 'cleancorp-buyer-created-tax-invoice.pdf');
  await chooseDirection(page, 'Money in: Sales invoice');
  await chooseContact(page, 'Cleancorp Ltd');
  if (!(await page.getByRole('button', { name: 'Create draft invoice' }).isDisabled())) {
    throw new Error('Duplicate acknowledgement did not block the otherwise complete invoice commit');
  }
  await page.getByText('Possible duplicate', { exact: true }).scrollIntoViewIfNeeded();
  await capture(page, '07-duplicate-warning.png');

  await uploadToReview(page, 'prompt-injection-invoice.pdf');
  await chooseDirection(page, 'Money out: Purchase bill');
  await chooseContact(page, 'Sparkle Supplies Ltd');
  if (!(await page.getByRole('button', { name: 'Create draft bill' }).isDisabled())) {
    throw new Error('Totals mismatch did not block the otherwise complete bill commit');
  }
  await page.getByText('Totals need correction').scrollIntoViewIfNeeded();
  await capture(page, '08-totals-mismatch-block.png');

  await uploadToReview(page, 'sparkle-supplies-bill.pdf');
  await chooseDirection(page, 'Money out: Purchase bill');
  await chooseContact(page, 'Sparkle Supplies Ltd');
  const billCommit = page.getByRole('button', { name: 'Create draft bill' });
  if (await billCommit.isDisabled()) throw new Error('Create draft bill stayed disabled after required review choices');
  await billCommit.click();
  await page.waitForURL(/\/bills\/[^/]+\/edit$/, { timeout: 30_000 });
  await page.getByText('Draft bill created').waitFor();
  await page.getByRole('heading', { name: 'Edit bill' }).waitFor({ timeout: 30_000 });
  await page.locator('#vendor-reference').waitFor();
  await capture(page, '11-bill-committed.png');

  const readOnlyPage = await readOnlyContext.newPage();
  await readOnlyPage.goto(`${webUrl}/invoices/import`, { waitUntil: 'networkidle' });
  await readOnlyPage.getByRole('heading', { name: 'Import access restricted' }).waitFor();
  await readOnlyPage.getByText("You don't have permission to import invoices", { exact: true }).waitFor();
  await capture(readOnlyPage, '12-read-only-denied.png');

  console.log(`Captured ${screenshots.length} authenticated screenshots against ${apiUrl}`);
} finally {
  await ownerContext.close();
  await readOnlyContext.close();
  await browser.close();
}
