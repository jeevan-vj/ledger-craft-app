import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { InvoiceMail } from '../invoices/mailer';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import { activeOrganisationSelections, organisationMemberships, organisations } from '../../db/schema/identity';
import { invoices } from '../../db/schema/invoices';
import { runDue } from './recurring.service';
const now = new Date('2026-11-08T00:00:00Z');
const schedule = { frequency: 'monthly', interval: 1, startDate: '2026-11-07', timezone: 'Pacific/Auckland', localTime: '09:00', occurrenceLimit: 1 };
describe('bound recurring delivery and authoritative actor checks', () => {
 it('emails the company A invoice and public share after the creator selects company B', async () => withTestDb(async () => {
  const f = await settlementFixture();
  try {
   const me = await f.request<{ user: { id: string }; organisation: { id: string } }>('/api/me', 'GET'); const orgA = me.organisation.id, userId = me.user.id, orgB = crypto.randomUUID();
   await f.request('/api/recurring-templates','POST',{ name: 'Company A delivery', payload: { kind: 'invoice', input: { customerId: String(f.customer.id), date: '2026-11-07', dueDate: '2026-11-21', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'A service', quantity: '1', rate: '100.00' }] }, send: { mode: 'auto', whenEmailUnavailable: 'draft' } }, schedule },201);
   await f.db.insert(organisations).values({id:orgB,name:'Company B'}); await f.db.insert(organisationMemberships).values({organisationId:orgB,userId,role:'owner'}); await f.db.insert(activeOrganisationSelections).values({userId,organisationId:orgB}).onConflictDoUpdate({target:activeOrganisationSelections.userId,set:{organisationId:orgB}});
   const sent: InvoiceMail[] = []; const sendInvoice = vi.fn(async (mail: InvoiceMail) => { sent.push(mail); }); const authorizer = vi.fn(async () => true);
   const result = await runDue(f.db,now,10,orgA,{availability:'available',sendInvoice},authorizer); expect(result).toMatchObject({succeeded:1,failed:0}); expect(sendInvoice).toHaveBeenCalledTimes(1); expect(sent[0].amountDue).toBe('115.00'); expect(sent[0].publicUrl).toContain(`/shared/invoice/${orgA}_`); expect(sent[0].deliveryKey).toMatch(/^recurring-/);
   const [document] = await f.db.select().from(invoices).where(eq(invoices.id,sent[0].invoiceId)); expect(document.organisationId).toBe(orgA); expect(document.status).toBe('sent'); expect(authorizer).toHaveBeenCalledWith(orgA,userId,'invoice'); expect(authorizer).toHaveBeenCalledTimes(3);
   const [selection] = await f.db.select().from(activeOrganisationSelections).where(eq(activeOrganisationSelections.userId,userId)); expect(selection.organisationId).toBe(orgB);
  } finally {await f.sql.end();}
 }));
 it('pauses a mirrored-owner schedule when authoritative Identity authorization denies execution', async () => withTestDb(async () => {
  const f=await settlementFixture();try {
   const me=await f.request<{organisation:{id:string}}>('/api/me','GET'); const template=await f.request('/api/recurring-templates','POST',{name:'Stale owner',payload:{kind:'expense',input:{description:'Must not post',amount:'115.00',expenseDate:'2026-11-07'}},schedule},201);
   const result=await runDue(f.db,now,10,me.organisation.id,undefined,async()=>false);expect(result.succeeded).toBe(0);expect(result.failed).toBe(1);expect(await f.db.query.expenses.findMany()).toHaveLength(0);
   const [saved]=await f.db.query.recurringTemplates.findMany({where:(r,o)=>o.eq(r.id,String(template.id))});expect(saved.status).toBe('paused');
  }finally{await f.sql.end();}
 }));
});
