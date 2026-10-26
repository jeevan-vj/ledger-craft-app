import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const mobileUrl = process.env.PHASE3_MOBILE_URL;
const apiUrl = process.env.PHASE3_API_URL;
const outputDir = process.env.PHASE3_OUTPUT_DIR;
const fixtureDir = process.env.PHASE3_FIXTURE_DIR;
if (!mobileUrl || !apiUrl || !outputDir || !fixtureDir) throw new Error('PHASE3_MOBILE_URL, PHASE3_API_URL, PHASE3_OUTPUT_DIR and PHASE3_FIXTURE_DIR are required');

const screenshots = ['01-import-entry.png', '02-source-picker.png', '03-uploading-processing.png', '04-review-original.png', '05-direction-third-party-warning.png', '06-duplicate-warning.png', '07-totals-mismatch-block.png', '08-committed-draft-original-link.png', '09-read-only-denied.png'];
await mkdir(outputDir, { recursive: true });
await Promise.all(screenshots.map((name) => rm(path.join(outputDir, name), { force: true })));

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const contextOptions = { viewport: { width: 390, height: 844 }, colorScheme: 'dark' };
const ownerContext = await browser.newContext(contextOptions);
const readOnlyContext = await browser.newContext(contextOptions);

async function api(context, pathname, { method = 'GET', body, expected = 200 } = {}) {
  const response = await context.request.fetch(`${apiUrl}${pathname}`, { method, headers: { Origin: mobileUrl, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, data: body });
  if (response.status() !== expected) throw new Error(`${method} ${pathname} returned ${response.status()}, expected ${expected}: ${await response.text()}`);
  return response.status() === 204 ? null : response.json();
}
async function capture(page, name) { await page.screenshot({ path: path.join(outputDir, name), animations: 'disabled' }); }
async function reveal(page, locator) {
  await page.mouse.move(195, 420);
  let box = await locator.boundingBox();
  for (let attempt = 0; box && (box.y < 72 || box.y + box.height > 820) && attempt < 12; attempt += 1) {
    await page.mouse.wheel(0, box.y > 420 ? 560 : -560);
    await page.waitForTimeout(80);
    box = await locator.boundingBox();
  }
  if (!box || box.y < 0 || box.y + box.height > 844) throw new Error(`Could not reveal evidence at y=${box?.y ?? 'missing'}`);
}
async function chooseFile(page, filename, delayUpload = false) {
  if (delayUpload) await page.route('**/api/invoice-imports', async (route) => { await new Promise((resolve) => setTimeout(resolve, 2600)); await route.continue(); });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(path.join(fixtureDir, filename));
  if (delayUpload) {
    await page.getByText('Uploading securely').waitFor();
    await capture(page, '03-uploading-processing.png');
  }
  await page.getByText('Review extraction').waitFor({ timeout: 30_000 });
  if (delayUpload) await page.unroute('**/api/invoice-imports');
}
async function openImport(page) {
  await page.goto(`${mobileUrl}/imports/new/invoices`, { waitUntil: 'networkidle' });
  await page.getByText('Bring in an invoice or bill').waitFor();
}
async function chooseDirection(page, name) {
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'PATCH' && /\/api\/invoice-imports\/[^/]+\/draft$/.test(new URL(candidate.url()).pathname));
  await page.getByRole('radio', { name }).click();
  if (!(await response).ok()) throw new Error(`Direction PATCH failed for ${name}`);
}
async function chooseContact(page, name) {
  await page.getByRole('button', { name: /choose customer|choose vendor/i }).click();
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'PATCH' && /\/api\/invoice-imports\/[^/]+\/draft$/.test(new URL(candidate.url()).pathname));
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click();
  if (!(await response).ok()) throw new Error(`Contact PATCH failed for ${name}`);
  const done = page.getByRole('button', { name: 'Done' });
  if (await done.isVisible()) await done.click();
}

async function setup() {
  const password = 'Local-phase3-mobile-123!';
  const ownerEmail = `phase3-mobile-owner-${Date.now()}@example.test`;
  const readOnlyEmail = `phase3-mobile-read-only-${Date.now()}@example.test`;
  await api(ownerContext, '/api/auth/sign-up/email', { method: 'POST', body: { name: 'Crystal Owner', email: ownerEmail, password } });
  await api(ownerContext, '/api/business-profile', { method: 'PUT', body: { name: 'Crystal Touch Cleaning', email: 'owner@crystal.example', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered' } });
  const owner = await api(ownerContext, '/api/me');
  await api(ownerContext, `/api/organisations/${owner.organisation.id}`, { method: 'PATCH', body: { name: 'Crystal Touch Cleaning' } });
  await api(ownerContext, '/api/customers', { method: 'POST', expected: 201, body: { name: 'Cleancorp Ltd', email: 'ap@cleancorp.example', country: 'NZ' } });
  await api(ownerContext, '/api/vendors', { method: 'POST', expected: 201, body: { name: 'Sparkle Supplies Ltd', email: 'accounts@sparkle.example' } });
  const invitation = await api(ownerContext, `/api/organisations/${owner.organisation.id}/invitations`, { method: 'POST', expected: 201, body: { email: readOnlyEmail, role: 'read_only' } });
  await api(readOnlyContext, '/api/auth/sign-up/email', { method: 'POST', body: { name: 'Read Only Reviewer', email: readOnlyEmail, password } });
  await api(readOnlyContext, '/api/invitations/accept', { method: 'POST', body: { token: invitation.acceptToken } });
}

try {
  await setup();
  const page = await ownerContext.newPage();
  page.on('console', (message) => console.error(`Browser console [${message.type()}]: ${message.text()}`));
  page.on('pageerror', (error) => console.error(`Browser page error: ${error.name}: ${error.message}\n${error.stack ?? ''}`));
  page.on('response', (response) => { if (!response.ok()) console.error(`Browser response ${response.status()}: ${response.url()}`); });
  await page.goto(mobileUrl, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await page.getByRole('button', { name: 'Import' }).waitFor();
  await capture(page, '01-import-entry.png');
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByText('Bring in an invoice or bill').waitFor();
  await capture(page, '02-source-picker.png');

  await chooseFile(page, 'cleancorp-buyer-created-tax-invoice.pdf', true);
  await page.getByRole('button', { name: /View original cleancorp-buyer-created-tax-invoice\.pdf/i }).click();
  await page.getByRole('button', { name: 'Close original preview' }).waitFor();
  await capture(page, '04-review-original.png');
  await page.getByRole('button', { name: 'Close original preview' }).click();
  await chooseDirection(page, 'Sales income');
  const thirdParty = page.getByRole('switch', { name: 'Issued by a third party' });
  if (!(await thirdParty.isChecked())) await thirdParty.click();
  await page.getByText('Confirm the third-party treatment').waitFor();
  await capture(page, '05-direction-third-party-warning.png');
  await chooseContact(page, 'Cleancorp Ltd');
  await page.getByRole('button', { name: 'Create draft invoice' }).click();
  await page.getByText('Source document').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'View original source document' }).scrollIntoViewIfNeeded();
  await capture(page, '08-committed-draft-original-link.png');

  await openImport(page);
  await chooseFile(page, 'cleancorp-buyer-created-tax-invoice.pdf');
  await chooseDirection(page, 'Sales income');
  await chooseContact(page, 'Cleancorp Ltd');
  await reveal(page, page.getByText('Possible duplicate', { exact: true }));
  await page.getByText('Acknowledge the possible duplicate.', { exact: true }).waitFor();
  await capture(page, '06-duplicate-warning.png');

  await openImport(page);
  await chooseFile(page, 'prompt-injection-invoice.pdf');
  await chooseDirection(page, 'Purchase / expense');
  await chooseContact(page, 'Sparkle Supplies Ltd');
  await reveal(page, page.getByText('Totals mismatch — draft blocked'));
  await page.getByText('Correct the totals mismatch before creating the draft.', { exact: true }).waitFor();
  await capture(page, '07-totals-mismatch-block.png');

  const deniedPage = await readOnlyContext.newPage();
  await deniedPage.goto(`${mobileUrl}/imports/new/invoices`, { waitUntil: 'networkidle' });
  await deniedPage.getByText('Import access restricted').waitFor();
  await capture(deniedPage, '09-read-only-denied.png');
  console.log(`Captured ${screenshots.length} Expo web screenshots at 390x844 against ${apiUrl}`);
} catch (error) {
  for (const [index, page] of ownerContext.pages().entries()) {
    console.error(`Owner page ${index + 1}: ${page.url()}`);
    console.error((await page.locator('body').innerText().catch(() => '<body unavailable>')).slice(0, 4000));
  }
  for (const [index, page] of readOnlyContext.pages().entries()) {
    console.error(`Read-only page ${index + 1}: ${page.url()}`);
    console.error((await page.locator('body').innerText().catch(() => '<body unavailable>')).slice(0, 4000));
  }
  throw error;
} finally {
  await ownerContext.close(); await readOnlyContext.close(); await browser.close();
}
