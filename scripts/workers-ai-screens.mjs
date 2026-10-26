import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const webUrl = process.env.WAI_WEB_URL;
const outputDir = process.env.WAI_OUTPUT_DIR;
const fixture = process.env.WAI_FIXTURE;
if (!webUrl || !outputDir || !fixture) throw new Error('WAI_WEB_URL, WAI_OUTPUT_DIR and WAI_FIXTURE are required');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
async function api(pathname, { method = 'GET', body, expected = 200 } = {}) {
  const r = await context.request.fetch(`${webUrl}${pathname}`, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, data: body });
  if (r.status() !== expected) throw new Error(`${method} ${pathname} -> ${r.status()}: ${await r.text()}`);
  return r.status() === 204 ? null : r.json();
}
const dismiss = (page) => page.evaluate(() => document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
try {
  await api('/api/auth/sign-up/email', { method: 'POST', body: { name: 'Crystal Owner', email: `wai-owner-${Date.now()}@example.test`, password: 'Local-wai-demo-123!' } });
  await api('/api/business-profile', { method: 'PUT', body: { name: 'Crystal Touch Cleaning', email: 'owner@crystal.example', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered' } });
  const me = await api('/api/me');
  await api(`/api/organisations/${me.organisation.id}`, { method: 'PATCH', body: { name: 'Crystal Touch Cleaning' } });
  await api('/api/vendors', { method: 'POST', expected: 201, body: { name: 'Kiwi Supplies Ltd', email: 'accounts@kiwisupplies.example' } });

  const health = await api('/api/healthz');
  console.log('healthz capabilities:', JSON.stringify(health.capabilities ?? null));

  const page = await context.newPage();
  await page.goto(`${webUrl}/invoices/import`, { waitUntil: 'networkidle' });
  await dismiss(page);
  await page.getByRole('heading', { name: 'Import from file' }).waitFor();
  await page.locator('input[type="file"][aria-label="Invoice file"]').setInputFiles(fixture);
  try {
    await page.getByRole('heading', { name: 'Review extraction' }).waitFor({ timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, 'debug-failure.png') });
    console.error((await page.locator('body').innerText()).slice(0, 1500));
    throw error;
  }
  const banner = page.getByText('Scanned with Cloudflare Workers AI, check carefully');
  await banner.waitFor();
  await page.waitForTimeout(2500);
  await dismiss(page);
  await page.screenshot({ path: path.join(outputDir, '01-review-workers-ai-label.png'), animations: 'disabled' });
  await banner.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, '02-review-workers-ai-label-closeup.png'), animations: 'disabled',
    clip: await page.getByRole('region', { name: 'Review extracted invoice fields' }).boundingBox().then((b) => ({ x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 700) })) });
  console.log('screenshots written');
} finally {
  await browser.close();
}
