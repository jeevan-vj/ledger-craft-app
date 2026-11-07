import { customerSchema, invoiceSchema, stripePaymentLinkSchema } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { createMockStripeGateway } from './stripe.mock-gateway';
import type { StripeConfig } from './stripe.gateway';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
export async function stripeFixture() {
  const { db, sql } = createDb(getDatabaseUrl());
  const gateway = createMockStripeGateway('http://localhost:8080');
  const config: StripeConfig = { enabled: true, mode: 'test' as const, mock: true, appUrl: 'http://localhost:8080', platformFeeBasisPoints: 400, platformFeeFixedCents: 30, webhookSecret: 'whsec_mock', connectWebhookSecret: 'whsec_mock' };
  const app = createApp({ db, auth: createAuth(db), stripeGateway: gateway, stripeConfig: config });
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Stripe Finance Owner', email: `stripe-ops-${crypto.randomUUID()}@example.test`, password: 'Local-password123' }) });
  const cookie = signup.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const call = async (path: string, body?: unknown, key?: string) => app.request(path, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, Cookie: cookie, ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  await app.request('/api/business-profile', { method: 'PUT', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ name: 'Finance Test Ltd', email: 'owner@example.test', country: 'NZ', gstRegistrationStatus: 'not_registered' }) });
  const customer = customerSchema.parse(await (await call('/api/customers', { name: 'Customer', email: 'buyer@example.test' })).json());
  const invoice = invoiceSchema.parse(await (await call('/api/invoices', { customerId: customer.id, date: '2026-11-01', dueDate: '2026-12-01', currency: 'NZD', taxInclusive: false, taxRate: '0', items: [{ description: 'Consulting', quantity: '1', rate: '100' }] })).json());
  await call('/api/payments/stripe/account', {}, 'account');
  const account = (await sql.unsafe('SELECT stripe_account_id FROM stripe_connected_accounts'))[0].stripe_account_id as string;
  gateway.completeAccount(account); await call('/api/payments/stripe/account/refresh', {});
  const link = stripePaymentLinkSchema.parse(await (await call(`/api/invoices/${invoice.id}/payment-links`, {}, 'link')).json());
  const row = (await sql.unsafe('SELECT * FROM stripe_payment_links WHERE id = ?', [link.id]))[0];
  return { db, sql, app, gateway, config, call, invoice, row, link, account };
}
