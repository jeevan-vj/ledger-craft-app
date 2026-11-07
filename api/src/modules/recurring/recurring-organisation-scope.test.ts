import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { RecurringPayload } from '@ledgercraft/contracts';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import { activeOrganisationSelections, organisationMemberships, organisations } from '../../db/schema/identity';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { bills } from '../../db/schema/purchases';
import { bankTransactions } from '../../db/schema/bank';
import { runDue } from './recurring.service';

const now = new Date('2026-11-08T00:00:00Z');
const schedule = { frequency: 'monthly', interval: 1, startDate: '2026-11-07', timezone: 'Pacific/Auckland', localTime: '09:00', occurrenceLimit: 1 };

describe('server recurring occurrences retain their verified template company', () => {
  for (const kind of ['expense', 'invoice', 'bill', 'income'] as const) {
    it(`creates ${kind} in company A after its creator selects company B`, async () => withTestDb(async () => {
      const f = await settlementFixture();
      try {
        const me = await f.request<{ user: { id: string }; organisation: { id: string } }>('/api/me', 'GET');
        const orgA = me.organisation.id, userId = me.user.id, orgB = crypto.randomUUID();
        const payload: RecurringPayload = kind === 'expense' ? { kind, input: { description: 'Scheduled company A rent', amount: '115.00', taxAmount: '15.00', expenseDate: '2026-11-07', currency: 'NZD', status: 'pending' } }
          : kind === 'invoice' ? { kind, input: { customerId: String(f.customer.id), date: '2026-11-07', dueDate: '2026-11-21', currency: 'NZD', items: [{ description: 'Scheduled company A service', quantity: '1', rate: '115' }] } }
          : kind === 'bill' ? { kind, input: { vendorId: String(f.vendor.id), issueDate: '2026-11-07', dueDate: '2026-11-21', currency: 'NZD', lines: [{ description: 'Scheduled company A supplies', quantity: '1', unitPrice: '115', taxRate: '0', accountId: String(f.cost.id) }] } }
          : { kind, input: { bankAccountId: String(f.bank.id), transactionDate: '2026-11-07', description: 'Scheduled company A income', amount: '115.00', type: 'credit' } };
        const created = await f.request('/api/recurring-templates', 'POST', { name: `Company A ${kind}`, payload, schedule }, 201);
        await f.db.insert(organisations).values({ id: orgB, name: 'Selected company B' });
        await f.db.insert(organisationMemberships).values({ organisationId: orgB, userId, role: 'owner' });
        await f.db.insert(activeOrganisationSelections).values({ userId, organisationId: orgB }).onConflictDoUpdate({ target: activeOrganisationSelections.userId, set: { organisationId: orgB } });
        const result = await runDue(f.db, now, 10, orgA);
        expect(result).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 });
        const [run] = await f.db.query.recurringRuns.findMany({ where: (row, operators) => operators.eq(row.templateId, String(created.id)) });
        expect(run?.generatedId).toBeTruthy();
        const table = kind === 'expense' ? expenses : kind === 'invoice' ? invoices : kind === 'bill' ? bills : bankTransactions;
        const [document] = await f.db.select({ organisationId: table.organisationId }).from(table).where(eq(table.id, run!.generatedId!));
        expect(document?.organisationId).toBe(orgA);
        const [selection] = await f.db.select().from(activeOrganisationSelections).where(eq(activeOrganisationSelections.userId, userId));
        expect(selection.organisationId).toBe(orgB);
      } finally { await f.sql.end(); }
    }));
  }

  for (const condition of ['removed', 'demoted', 'archived'] as const) {
    it(`refuses generation when the company A creator is ${condition}`, async () => withTestDb(async () => {
      const f = await settlementFixture();
      try {
        const me = await f.request<{ user: { id: string }; organisation: { id: string } }>('/api/me', 'GET');
        const orgA = me.organisation.id, userId = me.user.id, orgB = crypto.randomUUID();
        await f.request('/api/recurring-templates', 'POST', { name: 'Protected company A expense', payload: { kind: 'expense', input: { description: 'Protected expense', amount: '115.00', expenseDate: '2026-11-07' } }, schedule }, 201);
        await f.db.insert(organisations).values({ id: orgB, name: 'Selected company B' });
        await f.db.insert(organisationMemberships).values({ organisationId: orgB, userId, role: 'owner' });
        await f.db.insert(activeOrganisationSelections).values({ userId, organisationId: orgB }).onConflictDoUpdate({ target: activeOrganisationSelections.userId, set: { organisationId: orgB } });
        if (condition === 'archived') await f.db.update(organisations).set({ archivedAt: new Date() }).where(eq(organisations.id, orgA));
        else await f.db.update(organisationMemberships).set(condition === 'removed' ? { removedAt: new Date() } : { role: 'viewer' }).where(and(eq(organisationMemberships.organisationId, orgA), eq(organisationMemberships.userId, userId)));
        const result = await runDue(f.db, now, 10, orgA);
        expect(result.succeeded).toBe(0);
        expect(await f.db.select().from(expenses)).toHaveLength(0);
      } finally { await f.sql.end(); }
    }));
  }
});
