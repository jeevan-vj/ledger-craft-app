import { expect } from 'vitest';
import type { CurrencySettingsDto } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
export async function settlementFixture() {
  const { db, sql } = createDb(getDatabaseUrl());
  const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Settlement accountant', email: `${crypto.randomUUID()}@example.test`, password: 'Local-password123' }) });
  const cookie = signup.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const request = async <T = Record<string, unknown>>(path: string, method: string, body?: unknown, expected = 200) => {
    const response = await app.request(path, { method, headers: { ...headers, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    const value = text ? JSON.parse(text) : null;
    expect(response.status, JSON.stringify(value)).toBe(expected);
    return value as T;
  };
  await request('/api/business-profile', 'PUT', { name: 'Reviewed FX Limited', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '0' });
  const customer = await request('/api/customers', 'POST', { name: 'US customer', email: 'buyer@example.test' }, 201);
  const bank = await request('/api/bank-accounts', 'POST', { accountName: 'Operating NZD', accountNumber: crypto.randomUUID(), bankName: 'Test Bank', accountType: 'checking', currency: 'NZD' }, 201);
  const vendor = await request('/api/vendors', 'POST', { name: 'US vendor' }, 201);
  const cost = await request('/api/accounts', 'POST', { name: 'Subcontracting', type: 'expense', accountClass: 'expense', accountNumber: '5300' }, 201);
  const sourceRates = await request<CurrencySettingsDto>('/api/exchange-rates', 'POST', { currencyCode: 'USD', effectiveDate: '2026-10-01', rate: '1.60' }, 201);
  const sourceRate = sourceRates.rates.find((x) => x.effectiveDate === '2026-10-01')!;
  const settleRates = await request<CurrencySettingsDto>('/api/exchange-rates', 'POST', { currencyCode: 'USD', effectiveDate: '2026-10-20', rate: '1.65' }, 201);
  const rate = settleRates.rates.find((x) => x.effectiveDate === '2026-10-20')!;
  const invoice = await request('/api/invoices', 'POST', { customerId: customer.id, date: '2026-10-10', dueDate: '2026-11-10', currency: 'USD', taxInclusive: false, taxRate: '0', items: [{ description: 'USD consulting', quantity: '1', rate: '100' }] }, 201);
  const bill = await request('/api/bills', 'POST', { vendorId: vendor.id, issueDate: '2026-10-10', dueDate: '2026-11-10', currency: 'USD', taxInclusive: false, lines: [{ description: 'USD supplies', quantity: '1', unitPrice: '100', taxRate: '0', accountId: cost.id }] }, 201);
  return { db, sql, app, cookie, request, bank, customer, vendor, cost, sourceRate, rate, invoice, bill };
}
