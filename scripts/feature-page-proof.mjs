import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { privateProofDirectory, proofBrowserOptions, localProofOrigin } from './proof-runtime.mjs';

const origin = localProofOrigin(process.env.CLOSE_WEB_URL ?? 'http://127.0.0.1:8080');
const session = process.env.PROOF_SESSION;
const output = process.env.PROOF_OUTPUT;
assert.ok(session && output, 'Set PROOF_SESSION to a synthetic local session and PROOF_OUTPUT to a fresh evidence directory');
const catalogue = JSON.parse(await readFile(new URL('../docs/feature-verification.json', import.meta.url), 'utf8'));
await privateProofDirectory(output);
const browser = await chromium.launch(proofBrowserOptions());
const context = await browser.newContext({ storageState: session, timezoneId: 'Pacific/Auckland' });
const page = await context.newPage();
page.setDefaultTimeout(Number(process.env.PROOF_TIMEOUT_MS ?? 60000));
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
try {
  const me = await context.request.get(`${origin}/api/me`);
  assert.equal(me.status(), 200, 'A real local authenticated session is required');
  for (const route of [...new Set(catalogue.features.map(f => f.route))]) {
    const startErrors = errors.length;
    const responses = [];
    const record = response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/')) responses.push({ path: url.pathname, status: response.status() });
    };
    page.on('response', record);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + route, { waitUntil: 'networkidle' });
    await page.getByRole('main').waitFor();
    await page.evaluate(() => document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
    await expect.poll(() => page.getByRole('main').innerText(), { timeout: Number(process.env.PROOF_TIMEOUT_MS ?? 60000) }).toMatch(/\S[\s\S]{20}/);
    const text = await page.getByRole('main').innerText();
    assert.ok(text.trim().length > 20, `${route}: content not loaded`);
    assert.ok(!/Page not found|Something went wrong/i.test(text), `${route}: application error`);
    assert.equal(new URL(page.url()).pathname, route, `${route}: unexpectedly redirected`);
    const slug = route === '/' ? 'dashboard' : route.slice(1).replaceAll('/', '-');
    for (const [label, width, height] of [['desktop',1440,900],['phone',390,844]]) {
      await page.setViewportSize({ width, height });
      const file = `${slug}-${label}.png`;
      await page.screenshot({ path: resolve(output, file), animations: 'disabled' });
      results.push({ route, features: catalogue.features.filter(f => f.route === route).map(f => f.id),
        platform: 'Vite web', viewport: {width,height}, screenshot: file, status: 'RENDER_ONLY',
        confirmation: 'Authenticated local route rendered actual app content. This is not complete business-flow acceptance.',
        apiResponses: [...responses], pageErrors: errors.slice(startErrors), capturedAt: new Date().toISOString() });
    }
    page.off('response', record);
    assert.deepEqual(errors.slice(startErrors), [], `${route}: page errors`);
    assert.ok(responses.every(r => r.status < 500), `${route}: server errors`);
    await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`RENDER_ONLY ${route}`);
  }
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}
