import { customerSchema, invoiceSchema, invoiceListResponseSchema } from '@ledgercraft/contracts';
import { expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
it('presents overdue from organisation local date without rewriting stored status or balances', async () => withTestDb(async () => {
 const { db, sql } = createDb(getDatabaseUrl());
 vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T12:30:00Z'));
 try {
 const app = createApp({db,auth:createAuth(db)}); const base = {Origin:'http://localhost:8080','Content-Type':'application/json'};
 const signup=await app.request('/api/auth/sign-up/email',{method:'POST',headers:base,body:JSON.stringify({name:'Overdue owner',email:`${crypto.randomUUID()}@example.test`,password:'Local-Test123!'})});
 const h={...base,Cookie:signup.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
 const customer=customerSchema.parse(await(await app.request('/api/customers',{method:'POST',headers:h,body:JSON.stringify({name:'Buyer',email:'buyer@example.test'})})).json());
 const create=await app.request('/api/invoices',{method:'POST',headers:h,body:JSON.stringify({customerId:customer.id,date:'2026-10-01',dueDate:'2026-10-10',currency:'NZD',status:'sent',taxInclusive:false,taxRate:'0',items:[{description:'Consulting',quantity:'1',rate:'100'}]})});
 expect(create.status).toBe(201); const created=invoiceSchema.parse(await create.json());
 await sql`UPDATE invoices SET status = 'sent' WHERE id = ${created.id}`;
 const invoice=invoiceSchema.parse(await(await app.request(`/api/invoices/${created.id}`,{headers:h})).json());
 expect(invoice.status).toBe('sent'); expect(invoice.effectiveStatus).toBe('overdue'); expect(invoice.balanceDue).toBe('100.00');
 const list=invoiceListResponseSchema.parse(await(await app.request('/api/invoices',{headers:h})).json());expect(list.invoices[0].effectiveStatus).toBe('overdue');
 const rows=await sql`SELECT status FROM invoices WHERE id = ${invoice.id}`;expect(rows[0].status).toBe('sent');
 } finally {vi.useRealTimers();await sql.end({timeout:5});}
}));
