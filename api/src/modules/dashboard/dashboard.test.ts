import {
  dashboardLayoutListResponseSchema,
  dashboardResponseSchema,
  errorEnvelopeSchema,
  savedReportDefinitionSchema,
  savedReportListResponseSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

function cookieHeader(response: Response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name, email: `${crypto.randomUUID()}@example.com`, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return cookieHeader(response);
}

describe('dashboard and saved report routes', () => {
  it('protects dashboard data', async () => {
    const response = await createApp().request('/api/dashboard');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('uses ledger-authoritative reports and isolates personal layouts and saved reports', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Dashboard Owner A');
        const ownerB = await signUp(app, 'Dashboard Owner B');
        const [identity] = await sql.unsafe(
          `SELECT u.id AS user_id, m.organisation_id FROM users u
           JOIN organisation_memberships m ON m.user_id = u.id
           WHERE u.name = ?`,
          ['Dashboard Owner A'],
        );
        const userId = String(identity?.user_id);
        const organisationId = String(identity?.organisation_id);
        const customerId = crypto.randomUUID();
        const vendorId = crypto.randomUUID();
        const invoiceId = crypto.randomUUID();
        const billId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        await sql.unsafe(`INSERT INTO customers (id, organisation_id, user_id, name, email, country) VALUES (?, ?, ?, 'Exact Customer', 'customer@example.com', 'NZ')`, [customerId, organisationId, userId]);
        await sql.unsafe(`INSERT INTO invoices (id, organisation_id, user_id, invoice_number, customer_id, date, due_date, subtotal, tax_amount, total, total_paid, balance_due, payment_status, status, currency) VALUES (?, ?, ?, 'INV-EXACT', ?, '2026-10-10', '2026-10-30', '104.44', '15.66', '120.10', '50.05', '70.05', 'partially_paid', 'sent', 'NZD')`, [invoiceId, organisationId, userId, customerId]);
        await sql.unsafe(`INSERT INTO vendors (id, organisation_id, user_id, name) VALUES (?, ?, ?, 'Exact Vendor')`, [vendorId, organisationId, userId]);
        await sql.unsafe(`INSERT INTO bills (id, organisation_id, user_id, bill_number, vendor_id, issue_date, due_date, lifecycle_status, payment_status, currency, subtotal, tax_amount, total, total_paid, balance_due) VALUES (?, ?, ?, 'BILL-EXACT', ?, '2026-10-11', '2026-10-31', 'received', 'unpaid', 'NZD', '34.80', '5.22', '40.02', '0', '40.02')`, [billId, organisationId, userId, vendorId]);
        await sql.unsafe(`INSERT INTO expenses (id, organisation_id, user_id, description, amount, expense_date, status, tax_amount, currency) VALUES (?, ?, ?, 'Exact expense', '10.01', '2026-10-12', 'approved', '1.31', 'NZD')`, [crypto.randomUUID(), organisationId, userId]);
        await sql.unsafe(`INSERT INTO bank_accounts (id, organisation_id, user_id, account_name, account_number, bank_name, account_type, current_balance) VALUES (?, ?, ?, 'Operating', '12-0000-0000000-00', 'Bank', 'checking', '100.05')`, [accountId, organisationId, userId]);
        await sql.unsafe(`INSERT INTO bank_transactions (id, organisation_id, user_id, bank_account_id, transaction_date, description, amount, type) VALUES (?, ?, ?, ?, '2026-10-13', 'Deposit', '50.10', 'credit')`, [crypto.randomUUID(), organisationId, userId, accountId]);
        await sql.unsafe(`INSERT INTO bank_transactions (id, organisation_id, user_id, bank_account_id, transaction_date, description, amount, type) VALUES (?, ?, ?, ?, '2026-10-14', 'Fee', '0.05', 'debit')`, [crypto.randomUUID(), organisationId, userId, accountId]);

        const initialized = await app.request('/api/accounts/initialize', { method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA }, body: '{}' });
        const accounts = (await initialized.json() as { accounts: Array<{ id: string; accountNumber: string | null }> }).accounts;
        const bankAccount = accounts.find((account) => account.accountNumber === '1110')!;
        const revenueAccount = accounts.find((account) => account.accountNumber === '4000')!;
        const expenseAccountResponse = await app.request('/api/accounts', { method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA }, body: JSON.stringify({ name: 'Operating expenses', type: 'expense', accountNumber: '5000', accountClass: 'expense' }) });
        const expenseAccount = await expenseAccountResponse.json() as { id: string };
        const post = async (description: string, debitAccountId: string, creditAccountId: string, amount: string) => {
          const created = await app.request('/api/journal-entries', { method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA }, body: JSON.stringify({ description, entryDate: '2026-10-15', debitAccountId, creditAccountId, amount }) });
          const entry = await created.json() as { id: string };
          expect((await app.request(`/api/journal-entries/${entry.id}`, { method: 'PATCH', headers: { ...jsonHeaders, Cookie: ownerA }, body: JSON.stringify({ status: 'posted' }) })).status).toBe(200);
        };
        await post('Authoritative sale', bankAccount.id, revenueAccount.id, '120.10');
        await post('Authoritative expense', expenseAccount.id, bankAccount.id, '10.01');
        // GST is reported from the 2200/2150 ledger accounts, not from document rows.
        const ledgerAccount = async (accountNumber: string, name: string, accountClass: 'asset' | 'liability') => {
          const existing = accounts.find((account) => account.accountNumber === accountNumber);
          if (existing) return existing.id;
          const created = await app.request('/api/accounts', { method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA }, body: JSON.stringify({ name, type: accountClass, accountNumber, accountClass }) });
          return (await created.json() as { id: string }).id;
        };
        await post('Authoritative output GST', await ledgerAccount('1200', 'Accounts Receivable', 'asset'), await ledgerAccount('2200', 'GST Collected on Sales', 'liability'), '15.66');
        await post('Authoritative input GST', await ledgerAccount('2150', 'GST Paid on Purchases', 'asset'), await ledgerAccount('2100', 'Accounts Payable', 'liability'), '5.22');

        const dashboardResponse = await app.request('/api/dashboard?from=2026-10-01&to=2026-10-31&comparison=none', { headers: { Cookie: ownerA } });
        expect(dashboardResponse.status).toBe(200);
        const dashboard = dashboardResponseSchema.parse(await dashboardResponse.json());
        expect(dashboard.reports).toHaveLength(6);
        expect(dashboard.reports.filter((report) => report.type !== 'activity').every((report) => report.authority.source === 'posted_ledger')).toBe(true);
        expect(dashboard.reports.find((report) => report.type === 'activity')?.authority.status).toBe('operational');
        expect(dashboard.reports.find((report) => report.type === 'summary')?.metrics.map((item) => item.value)).toEqual(['120.10', '10.01', '110.09']);
        expect(dashboard.reports.find((report) => report.type === 'receivables')?.metrics[0]?.value).toBe('70.05');
        expect(dashboard.reports.find((report) => report.type === 'payables')?.metrics[0]?.value).toBe('40.02');
        expect(dashboard.reports.find((report) => report.type === 'cash')?.metrics.map((item) => item.value)).toEqual(['120.10', '10.01', '110.09', '110.09']);
        expect(dashboard.reports.find((report) => report.type === 'tax')?.metrics.map((item) => item.value)).toEqual(['15.66', '5.22', '10.44']);

        const hiddenActivity = dashboard.layout.widgets.map((widget) => widget.kind === 'activity' ? { ...widget, visible: false } : widget);
        const layoutResponse = await app.request('/api/dashboard-layouts', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ name: 'Owner focus', isDefault: true, filters: dashboard.layout.filters, widgets: hiddenActivity }),
        });
        expect(layoutResponse.status).toBe(201);
        const ownerLayouts = dashboardLayoutListResponseSchema.parse(await (await app.request('/api/dashboard-layouts', { headers: { Cookie: ownerA } })).json());
        expect(ownerLayouts.layouts.find((layout) => layout.name === 'Owner focus')?.widgets.find((widget) => widget.kind === 'activity')?.visible).toBe(false);
        const otherLayouts = dashboardLayoutListResponseSchema.parse(await (await app.request('/api/dashboard-layouts', { headers: { Cookie: ownerB } })).json());
        expect(otherLayouts.layouts).toEqual([]);

        const savedResponse = await app.request('/api/saved-reports', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ name: 'October cash', reportType: 'cash', filters: dashboard.layout.filters, isPinned: true }),
        });
        expect(savedResponse.status).toBe(201);
        const saved = savedReportDefinitionSchema.parse(await savedResponse.json());
        const duplicated = await app.request(`/api/saved-reports/${saved.id}/duplicate`, { method: 'POST', headers: { Cookie: ownerA } });
        expect(duplicated.status).toBe(201);
        const archived = await app.request(`/api/saved-reports/${saved.id}`, {
          method: 'PATCH', headers: { ...jsonHeaders, Cookie: ownerA }, body: JSON.stringify({ name: 'Renamed cash', isArchived: true }),
        });
        expect(savedReportDefinitionSchema.parse(await archived.json())).toMatchObject({ name: 'Renamed cash', isArchived: true });
        const activeReports = savedReportListResponseSchema.parse(await (await app.request('/api/saved-reports', { headers: { Cookie: ownerA } })).json());
        expect(activeReports.reports).toHaveLength(1);
        const otherReports = savedReportListResponseSchema.parse(await (await app.request('/api/saved-reports?archived=true', { headers: { Cookie: ownerB } })).json());
        expect(otherReports.reports).toEqual([]);
        expect((await app.request(`/api/saved-reports/${saved.id}`, { method: 'PATCH', headers: { ...jsonHeaders, Cookie: ownerB }, body: '{}' })).status).toBe(404);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
