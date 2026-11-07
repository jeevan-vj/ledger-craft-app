import { describe, it, expect } from 'vitest';
import { createApp } from '../../app';
import { createAuth } from '../auth/auth';
import { withTestDb } from '../../test/harness';
import { createStatementShareForUser, publicStatement, revokeStatementSharesForUser, sendStatementForUser } from './customer-statements.delivery';
import { reminderLogForUser } from '../payment-reminders/payment-reminders.service';
import { organisationMemberships } from '../../db/schema/identity';
import { statementShares } from '../../db/schema/customer-collections';
import { eq } from 'drizzle-orm';
import { customerStatementForUser } from './customer-statements.service';
import { runPaymentReminders, updateReminderSettingsForUser, setReminderOptOutForUser } from '../payment-reminders/payment-reminders.service';
import { createUnavailableInvoiceMailer } from '../invoices/mailer';
const origin = { 'Origin': 'http://localhost:8080', 'Content-Type': 'application/json' };
async function fixture(db: Parameters<typeof createAuth>[0], invoiceMailer?: import('../invoices/mailer').InvoiceMailer) {
    const auth = createAuth(db), app = createApp({ db, auth, invoiceMailer, checkDatabase: async () => true });
    const res = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'Collections owner', email: `collections-${crypto.randomUUID()}@example.test`, password: 'password123' }) });
    expect(res.status).toBe(200);
    const signup = await res.json() as {
        user: {
            id: string;
        };
    };
    const cookie = res.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    const headers = { ...origin, Cookie: cookie };
    const request = async <T = {
        id: string;
    }>(path: string, body: unknown, method = 'POST'): Promise<T> => { const r = await app.request('/api' + path, { method, headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) }); expect(r.status, await r.clone().text()).toBeLessThan(300); return await r.json() as T; };
    await request('/business-profile', { name: 'Collections Ltd', country: 'NZ', email: 'owner@example.test', gstRegistrationStatus: 'not_registered' }, 'PUT');
    const customer = await request('/customers', { name: 'Harbour buyer', email: 'buyer@example.test' });
    const invoice = await request('/invoices', { customerId: customer.id, date: '2026-09-20', dueDate: '2026-10-10', taxInclusive: true, taxRate: '0', items: [{ description: 'Consulting', quantity: '1', rate: '1000' }], status: 'sent' });
    await request(`/invoices/${invoice.id}`, { status: 'sent' }, 'PATCH');
    const me = await (await app.request('/api/me', { headers })).json() as {
        organisation: {
            id: string;
        };
    };
    return { userId: signup.user.id, organisationId: me.organisation.id, customer, invoice, request, app, headers };
}
describe('customer statements and automatic reminders', () => {
    it('retains historical opening/closing balances and exact running totals across later payment reversal', async () => withTestDb(async ({ db }) => {
        const f = await fixture(db);
        const p = await f.request('/payments', { invoiceId: f.invoice.id, amount: '400', paymentDate: '2026-10-05', paymentMethod: 'bank_transfer' });
        const oct = await customerStatementForUser(db, f.userId, f.customer.id, { type: 'activity', from: '2026-10-01', to: '2026-10-31' });
        expect(oct.openingBalance).toBe('1000.00');
        expect(oct.closingBalance).toBe('600.00');
        expect(oct.lines.map(l => l.runningBalance)).toEqual(['600.00']);
        expect(oct.aging.days1To30).toBe('600.00');
        const report = await (await f.app.request('/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual&baseCurrency=NZD', { headers: f.headers })).json() as {
            receivablesAging: {
                days1To30: string;
            };
        };
        expect(oct.aging.days1To30).toBe(report.receivablesAging.days1To30);
        await f.request(`/payments/${p.id}/reverse`, { reversalDate: '2026-11-02', reason: 'Bank payment returned' });
        const prior = await customerStatementForUser(db, f.userId, f.customer.id, { type: 'activity', from: '2026-10-01', to: '2026-10-31' });
        expect(prior.closingBalance).toBe('600.00');
        const open = await customerStatementForUser(db, f.userId, f.customer.id, { type: 'open_items', from: '2026-10-01', to: '2026-11-03' });
        expect(open.closingBalance).toBe('1000.00');
    }));
    it('sends each configured step once and never sends after payment or optout; unavailable email is bounded', async () => withTestDb(async ({ db }) => {
        const f = await fixture(db);
        await updateReminderSettingsForUser(db, f.userId, { enabled: true, timeZone: 'Pacific/Auckland', localTime: '09:00', steps: [{ id: 'due', offsetDays: 0, reminderType: 'gentle' }, { id: 'later', offsetDays: 7, reminderType: 'firm' }] });
        const sent: string[] = [];
        const mailer = { availability: 'available' as const, sendInvoice: async () => { }, sendReminder: async (mail: {
                invoiceId: string;
            }) => { sent.push(mail.invoiceId); } };
        await Promise.all([runPaymentReminders(db, f.organisationId, mailer, new Date('2026-10-09T21:00:00Z')), runPaymentReminders(db, f.organisationId, mailer, new Date('2026-10-09T21:00:00Z'))]);
        expect(sent).toHaveLength(1);
        await setReminderOptOutForUser(db, f.userId, 'invoice', f.invoice.id, true);
        await runPaymentReminders(db, f.organisationId, mailer, new Date('2026-10-16T21:00:00Z'));
        expect(sent).toHaveLength(1);
        await setReminderOptOutForUser(db, f.userId, 'invoice', f.invoice.id, false);
        await runPaymentReminders(db, f.organisationId, createUnavailableInvoiceMailer(), new Date('2026-10-16T21:00:00Z'));
        await runPaymentReminders(db, f.organisationId, createUnavailableInvoiceMailer(), new Date('2026-10-16T22:00:00Z'));
        expect(sent).toHaveLength(1);
    }));
    it('uses stable email delivery claims, preserves public snapshots and revokes or expires links', async () => withTestDb(async ({ db }) => {
        const f = await fixture(db), query = { type: 'activity' as const, from: '2026-09-01', to: '2026-10-31' };
        let emails = 0;
        const mailer = { availability: 'available' as const, sendInvoice: async () => { }, sendStatement: async () => { emails++; } };
        const original = await sendStatementForUser(db, f.userId, f.customer.id, query, mailer, 'http://localhost:8080', 'statement-test');
        const replay = await sendStatementForUser(db, f.userId, f.customer.id, query, mailer, 'http://localhost:8080', 'statement-test');
        expect(replay).toEqual(original);
        expect(emails).toBe(1);
        await expect(sendStatementForUser(db,f.userId,f.customer.id,{...query,to:'2026-10-30'},mailer,'http://localhost:8080','statement-test')).rejects.toMatchObject({status:409});
        let failedAttempts=0;const rejecting={availability:'available' as const,sendInvoice:async()=>{},sendStatement:async()=>{failedAttempts++;throw new Error('Rejected delivery');}};
        await expect(sendStatementForUser(db,f.userId,f.customer.id,query,rejecting,'http://localhost:8080','failed-statement')).rejects.toThrow('Rejected delivery');
        await expect(sendStatementForUser(db,f.userId,f.customer.id,query,rejecting,'http://localhost:8080','failed-statement')).rejects.toMatchObject({status:502});expect(failedAttempts).toBe(1);
        const share = await createStatementShareForUser(db, f.userId, f.customer.id, query, 'http://localhost:8080');
        const snapshot = await publicStatement(db, share.token);
        expect(snapshot.closingBalance).toBe('1000.00');
        await f.request('/payments', { invoiceId: f.invoice.id, amount: '400', paymentDate: '2026-10-05', paymentMethod: 'bank_transfer' });
        expect((await publicStatement(db, share.token)).closingBalance).toBe('1000.00');
        await revokeStatementSharesForUser(db, f.userId, f.customer.id);
        await expect(publicStatement(db, share.token)).rejects.toMatchObject({ status: 404 });
        const expired = await createStatementShareForUser(db, f.userId, f.customer.id, query, 'http://localhost:8080');
        await db.update(statementShares).set({ expiresAt: new Date('2020-01-01') }).where(eq(statementShares.customerId, f.customer.id));
        await expect(publicStatement(db, expired.token)).rejects.toMatchObject({ status: 404 });
    }));
    it('cancels later reminders when payment settles the invoice and retains one unavailable log', async () => withTestDb(async ({ db }) => {
        const f = await fixture(db);
        await updateReminderSettingsForUser(db, f.userId, { enabled: true, timeZone: 'Pacific/Auckland', localTime: '09:00', steps: [{ id: 'due', offsetDays: 0, reminderType: 'gentle' }, { id: 'later', offsetDays: 7, reminderType: 'firm' }] });
        let emails = 0;
        const mailer = { availability: 'available' as const, sendInvoice: async () => { }, sendReminder: async () => { emails++; } };
        await runPaymentReminders(db, f.organisationId, createUnavailableInvoiceMailer(), new Date('2026-10-09T21:00:00Z'));
        await runPaymentReminders(db, f.organisationId, createUnavailableInvoiceMailer(), new Date('2026-10-09T22:00:00Z'));
        expect((await reminderLogForUser(db, f.userId, f.invoice.id)).logs).toHaveLength(1);
        expect((await reminderLogForUser(db, f.userId, f.invoice.id)).logs[0]?.reason).toBe('email_unavailable');
        await f.request('/payments', { invoiceId: f.invoice.id, amount: '1000', paymentDate: '2026-10-11', paymentMethod: 'bank_transfer' });
        await runPaymentReminders(db, f.organisationId, mailer, new Date('2026-10-16T21:00:00Z'));
        expect(emails).toBe(0);
    }));
    it('shows receivable credits and customer-credit refunds without rewriting earlier periods', async () => withTestDb(async ({ db }) => {
        const f = await fixture(db);
        await f.request('/payments', { invoiceId: f.invoice.id, amount: '1000', paymentDate: '2026-10-05', paymentMethod: 'bank_transfer' });
        const credit = await f.request('/credit-notes', { invoiceId: f.invoice.id, issueDate: '2026-10-06', reason: 'Returned services', taxInclusive: true, taxRate: '0', items: [{ description: 'Returned services', quantity: '1', rate: '200' }] });
        expect(credit.id).toBeTruthy();
        const result = await customerStatementForUser(db, f.userId, f.customer.id, { type: 'activity', from: '2026-10-01', to: '2026-10-31' });
        expect(result.lines.some(v => v.description.includes('Returned services'))).toBe(false);
        expect(result.openingBalance).toBe('1000.00');
        expect(result.closingBalance).toBe('-200.00');
        expect(result.aging.current).toBe('0.00');
        const bank = await f.request('/bank-accounts', { accountName: 'Operating', accountNumber: '123', bankName: 'Test Bank', accountType: 'checking' });
        await f.request(`/credit-notes/${credit.id}/refunds`, { amount: '50', refundDate: '2026-11-02', bankAccountId: bank.id });
        expect((await customerStatementForUser(db, f.userId, f.customer.id, { type: 'activity', from: '2026-10-01', to: '2026-10-31' })).closingBalance).toBe('-200.00');
        expect((await customerStatementForUser(db, f.userId, f.customer.id, { type: 'activity', from: '2026-11-01', to: '2026-11-30' })).closingBalance).toBe('-150.00');
    }));
    it('attributes a bank-reconciliation undo to its original customer allocations', async () => withTestDb(async ({ db }) => {
        const f = await fixture(db);
        const bank = await f.request('/bank-accounts', { accountName: 'Operating', accountNumber: '123', bankName: 'Test Bank', accountType: 'checking' });
        const imported = await f.request<{
            transactions: {
                id: string;
            }[];
        }>('/bank-transactions/import', { bankAccountId: bank.id, transactions: [{ transactionDate: '2026-10-05', amount: '400', type: 'credit', description: 'Customer receipt' }] });
        const transaction = imported.transactions[0]!;
        await f.request(`/bank-transactions/${transaction.id}/accept`, { allocations: [{ documentType: 'invoice', documentId: f.invoice.id, amount: '400' }] });
        expect((await customerStatementForUser(db, f.userId, f.customer.id, { type: 'activity', from: '2026-10-01', to: '2026-10-31' })).closingBalance).toBe('600.00');
        await f.request(`/bank-transactions/${transaction.id}/undo`, { reason: 'Wrong deposit matched', reversalDate: '2026-11-02' });
        expect((await customerStatementForUser(db, f.userId, f.customer.id, { type: 'activity', from: '2026-11-01', to: '2026-11-30' })).closingBalance).toBe('1000.00');
    }));
    it('isolates companies and prevents read-only users from sharing or changing reminders', async () => withTestDb(async ({ db }) => {
        const a = await fixture(db), b = await fixture(db), query = { type: 'activity' as const, from: '2026-09-01', to: '2026-10-31' };
        await expect(customerStatementForUser(db, b.userId, a.customer.id, query)).rejects.toMatchObject({ status: 404 });
        await expect(setReminderOptOutForUser(db, b.userId, 'invoice', a.invoice.id, true)).rejects.toMatchObject({ status: 404 });
        await db.update(organisationMemberships).set({ role: 'read_only' }).where(eq(organisationMemberships.userId, a.userId));
        expect((await customerStatementForUser(db, a.userId, a.customer.id, query)).closingBalance).toBe('1000.00');
        await expect(createStatementShareForUser(db, a.userId, a.customer.id, query, 'http://localhost:8080')).rejects.toMatchObject({ status: 403 });
        await expect(updateReminderSettingsForUser(db, a.userId, { enabled: true, timeZone: 'Pacific/Auckland', localTime: '09:00', steps: [{ id: 'due', offsetDays: 0, reminderType: 'gentle' }] })).rejects.toMatchObject({ status: 403 });
    }));
    it('waits until the configured Auckland local time and never targets drafts or cancelled invoices', async () => withTestDb(async ({ db }) => {
        const f = await fixture(db);
        await updateReminderSettingsForUser(db, f.userId, { enabled: true, timeZone: 'Pacific/Auckland', localTime: '09:00', steps: [{ id: 'due', offsetDays: 0, reminderType: 'gentle' }] });
        await f.request('/invoices', { customerId: f.customer.id, date: '2026-09-20', dueDate: '2026-10-10', taxInclusive: true, taxRate: '0', items: [{ description: 'Unissued draft', quantity: '1', rate: '100' }] });
        const cancelled = await f.request('/invoices', { customerId: f.customer.id, date: '2026-09-20', dueDate: '2026-10-10', taxInclusive: true, taxRate: '0', items: [{ description: 'Cancelled supply', quantity: '1', rate: '100' }] });
        await f.request(`/invoices/${cancelled.id}`, { status: 'sent' }, 'PATCH');
        await f.request(`/invoices/${cancelled.id}/cancel`, { reason: 'Cancelled by buyer' });
        const sent: string[] = [];
        const publicLinks: string[] = [];
        const mailer = { availability: 'available' as const, sendInvoice: async () => { }, sendReminder: async (v: {
                invoiceId: string;
                publicUrl?: string;
            }) => { sent.push(v.invoiceId); publicLinks.push(v.publicUrl ?? ''); } };
        await runPaymentReminders(db, f.organisationId, mailer, new Date('2026-10-09T19:59:00Z'));
        expect(sent).toHaveLength(0);
        await runPaymentReminders(db, f.organisationId, mailer, new Date('2026-10-09T20:00:00Z'));
        expect(sent).toEqual([f.invoice.id]);
        expect(publicLinks[0]).toMatch(/^http:\/\/localhost:8080\/shared\/invoice\//);
    }));
    it('serves authorised HTTP statements, anonymous public snapshots and idempotent bulk-send counts', async () => withTestDb(async ({ db }) => {
        let emails = 0;
        const mailer = { availability: 'available' as const, sendInvoice: async () => { }, sendStatement: async () => { emails++; } };
        const f = await fixture(db, mailer), query = { type: 'activity' as const, from: '2026-09-01', to: '2026-10-31' };
        const get = await f.app.request(`/api/customers/${f.customer.id}/statement?type=activity&from=2026-09-01&to=2026-10-31`, { headers: f.headers });
        expect(get.status).toBe(200);
        expect((await get.json() as {
            closingBalance: string;
        }).closingBalance).toBe('1000.00');
        expect((await f.app.request(`/api/customers/${f.customer.id}/statement?from=2026-09-01&to=2026-10-31`)).status).toBe(401);
        const share = await f.request<{
            token: string;
        }>(`/customers/${f.customer.id}/statement/share`, query);
        expect((await f.app.request(`/api/public/customer-statements/${share.token}`)).status).toBe(200);
        const empty = await f.request('/customers', { name: 'No balance', email: 'empty@example.test' });
        const body = { ...query, customerIds: [f.customer.id, empty.id] }, headers = { ...f.headers, 'Idempotency-Key': 'bulk-statement-case' };
        for (let i = 0; i < 2; i++) {
            const response = await f.app.request('/api/customer-statements/send-bulk', { method: 'POST', headers, body: JSON.stringify(body) });
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ sent: 1, skipped: 1, failed: 0 });
        }
        expect(emails).toBe(1);
        const later=await f.request('/invoices',{customerId:empty.id,date:'2026-10-10',dueDate:'2026-10-20',taxInclusive:true,taxRate:'0',items:[{description:'Late invoice',quantity:'1',rate:'100'}]});await f.request(`/invoices/${later.id}`,{status:'sent'},'PATCH');
        const replay=await f.app.request('/api/customer-statements/send-bulk',{method:'POST',headers,body:JSON.stringify(body)});expect(await replay.json()).toMatchObject({sent:1,skipped:1,failed:0});expect(emails).toBe(1);
        await db.update(organisationMemberships).set({ role: 'read_only' }).where(eq(organisationMemberships.userId, f.userId));
        const denied = await f.app.request(`/api/customers/${f.customer.id}/statement/share`, { method: 'POST', headers: f.headers, body: JSON.stringify(query) });
        expect(denied.status).toBe(403);
    }));
    it('requires the live Identity reminder actor when supplied and does not fall back after revocation',async()=>withTestDb(async({db})=>{
      const f=await fixture(db),other=await fixture(db);await updateReminderSettingsForUser(db,f.userId,{enabled:true,timeZone:'Pacific/Auckland',localTime:'09:00',steps:[{id:'due',offsetDays:0,reminderType:'gentle'}]});let sends=0;const mailer={availability:'available' as const,sendInvoice:async()=>{},sendReminder:async()=>{sends++;}};const now=new Date('2026-10-09T20:00:00Z');
      const revoked=await runPaymentReminders(db,f.organisationId,mailer,now,'http://localhost:8080',null);expect(revoked.nextRunAt).toBeNull();expect(sends).toBe(0);
      await runPaymentReminders(db,f.organisationId,mailer,now,'http://localhost:8080',{userId:other.userId});expect(sends).toBe(0);expect((await reminderLogForUser(db,f.userId,f.invoice.id)).logs).toHaveLength(0);
      await runPaymentReminders(db,f.organisationId,mailer,now,'http://localhost:8080',{userId:f.userId});expect(sends).toBe(1);
    }));

});
