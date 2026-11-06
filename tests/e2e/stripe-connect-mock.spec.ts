import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve('docs/verification/stripe-connect');

async function okJson(request: APIRequestContext, url: string, options: Parameters<APIRequestContext['fetch']>[1]) {
  const result = await request.fetch(url, options);
  const text = await result.text();
  expect(result.ok(), `${options?.method || 'GET'} ${url} -> ${result.status()} ${text}`).toBeTruthy();
  return text ? JSON.parse(text) : {};
}

test('mock Stripe Connect: onboard, payment link, checkout, receipt', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseURL)) {
    throw new Error('Use a local test server');
  }
  await mkdir(artifacts, { recursive: true });

  const health = await (await fetch(`${baseURL}/api/healthz`)).json() as { capabilities?: { stripe?: string } };
  expect(health.capabilities?.stripe, 'Stripe capability should be available in local mock mode').toBe('available');

  const owner = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const request = owner.request;
  const origin = { Origin: baseURL };
  const results: Record<string, 'pass' | 'fail'> = {
    onboarding: 'fail',
    ready: 'fail',
    'payment-link': 'fail',
    checkout: 'fail',
    receipt: 'fail',
  };

  try {
    await okJson(request, '/api/auth/sign-up/email', {
      method: 'POST',
      headers: origin,
      data: { name: 'Stripe Mock Owner', email: `stripe-mock-${Date.now()}@example.com`, password: 'Local-stripe-mock-123!' },
    });
    await okJson(request, '/api/business-profile', {
      method: 'PUT',
      headers: origin,
      data: { name: 'Kauri Studio Ltd', email: 'studio@example.com', country: 'NZ', defaultTaxRate: '15' },
    });
    const customer = await okJson(request, '/api/customers', {
      method: 'POST',
      headers: origin,
      data: { name: 'North Harbour Cafe', email: 'cafe@example.com', country: 'NZ' },
    });
    const invoice = await okJson(request, '/api/invoices', {
      method: 'POST',
      headers: origin,
      data: {
        customerId: customer.id,
        date: '2026-11-06',
        dueDate: '2026-12-06',
        taxRate: '15',
        taxInclusive: false,
        items: [{ description: 'Design services', quantity: '1', rate: '100' }],
      },
    });

    await okJson(request, '/api/payments/stripe/account', {
      method: 'POST',
      headers: { ...origin, 'Idempotency-Key': crypto.randomUUID() },
      data: {},
    });
    const onboarding = await okJson(request, '/api/payments/stripe/account/onboarding-link', {
      method: 'POST',
      headers: origin,
      data: { platform: 'web' },
    });
    expect(onboarding.url).toMatch(/\/api\/stripe\/mock\/onboarding\//);

    const page = await owner.newPage();
    page.setDefaultTimeout(20_000);
    const dismiss = async (target: Page) => {
      await target.locator('[aria-label="Dismiss update prompt"]').click().catch(() => undefined);
    };

    await test.step('onboarding simulator', async () => {
      await page.goto(onboarding.url);
      await expect(page.getByRole('heading', { name: 'Stripe onboarding simulator' })).toBeVisible();
      await expect(page.getByText('TEST MODE · NO REAL STRIPE DATA')).toBeVisible();
      await page.screenshot({ path: path.join(artifacts, 'onboarding.png'), fullPage: true });
      results.onboarding = 'pass';
      await page.getByRole('button', { name: 'Complete test onboarding' }).click();
    });

    await test.step('readiness', async () => {
      await page.waitForURL(/\/settings/);
      await dismiss(page);
      await expect(page.getByRole('tab', { name: 'Card payments' })).toBeVisible();
      await page.getByRole('tab', { name: 'Card payments' }).click();
      await expect(page.getByText('Ready to accept card payments')).toBeVisible();
      await expect(page.getByText('Charges enabled')).toBeVisible();
      await expect(page.getByText('Payouts enabled')).toBeVisible();
      await page.screenshot({ path: path.join(artifacts, 'ready.png'), fullPage: true });
      results.ready = 'pass';
    });

    await test.step('payment link and QR', async () => {
      await page.goto(`/invoices/${invoice.id}`);
      await dismiss(page);
      await page.getByRole('button', { name: 'Card payment' }).click();
      await page.getByRole('button', { name: 'Create payment link' }).click();
      await expect(page.getByLabel('Stripe payment QR code')).toBeVisible();
      await expect(page.getByLabel('Payment link')).toHaveValue(/\/pay\//);
      await page.screenshot({ path: path.join(artifacts, 'payment-link.png'), fullPage: true });
      results['payment-link'] = 'pass';
    });

    const payUrl = await page.getByLabel('Payment link').inputValue();
    const checkout = await owner.newPage();
    checkout.setDefaultTimeout(20_000);

    await test.step('checkout simulator', async () => {
      await checkout.goto(payUrl);
      await expect(checkout.getByRole('heading', { name: 'Stripe Checkout simulator' })).toBeVisible();
      await expect(checkout.getByText('TEST CARD · NO REAL CHARGE')).toBeVisible();
      await checkout.screenshot({ path: path.join(artifacts, 'checkout.png'), fullPage: true });
      results.checkout = 'pass';
      await checkout.getByRole('button', { name: /Pay with test card/ }).click();
    });

    await test.step('receipt after webhook settlement', async () => {
      await checkout.waitForURL(/status=success/);
      await expect(checkout.getByRole('heading', { name: 'Payment submitted' })).toBeVisible();
      await checkout.screenshot({ path: path.join(artifacts, 'receipt.png'), fullPage: true });
      const paid = await okJson(request, `/api/invoices/${invoice.id}/payment-links`, { headers: origin });
      const settled = (paid.items ?? []).some((item: { status?: string; receiptId?: string }) => item.status === 'paid' && item.receiptId);
      expect(settled, 'payment link should settle with a receipt id').toBeTruthy();
      results.receipt = 'pass';
    });
  } finally {
    await owner.close();
    console.log(`STRIPE_E2E_STEPS ${JSON.stringify(results)}`);
  }
});
