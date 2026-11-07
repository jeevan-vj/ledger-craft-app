import {it,expect} from 'vitest';
import {createApp} from '../../app';import {createAuth} from '../auth/auth';import {withTestDb} from '../../test/harness';
it('recognises the GST-exclusive paid portion of a credit invoice in cash P&L',async()=>withTestDb(async({db})=>{
 const app=createApp({db,auth:createAuth(db),checkDatabase:async()=>true});const headers={Origin:'http://localhost:8080','Content-Type':'application/json'};
 const signup=await app.request('/api/auth/sign-up/email',{method:'POST',headers,body:JSON.stringify({name:'Cashreport owner',email:`${crypto.randomUUID()}@example.test`,password:'Local-testing-123!'})});expect(signup.status).toBe(200);const Cookie=signup.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 async function request(path:string,method='GET',body?:unknown,status=200){const response=await app.request(path,{method,headers:{...headers,Cookie},body:body?JSON.stringify(body):undefined});expect(response.status,await response.clone().text()).toBe(status);return response.json();}
 await request('/api/business-profile','PUT',{name:'Cash report business',email:'owner@example.test',country:'NZ',gstRegistrationStatus:'registered',taxId:'49091850',gstRegisteredFrom:'2026-04-01'});
 const customer=await request('/api/customers','POST',{name:'Cash report buyer',email:'buyer@example.test'},201) as {id:string};
 const invoice=await request('/api/invoices','POST',{customerId:customer.id,date:'2026-04-03',dueDate:'2026-04-30',taxInclusive:false,taxRate:'15',currency:'NZD',items:[{description:'Consulting',quantity:'1',rate:'1000'}]},201) as {id:string};
 await request('/api/payments','POST',{invoiceId:invoice.id,amount:'575',paymentDate:'2026-04-10',paymentMethod:'bank_transfer'},201);
 await request('/api/expenses','POST',{description:'Paid expense',amount:'230',taxAmount:'30',gstTreatment:'standard',currency:'NZD',status:'approved',expenseDate:'2026-04-12'},201);
 const before=await request('/api/reports/general-ledger?from=2026-04-01&to=2026-04-30&basis=accrual') as {lines:unknown[]};
 const report=await request('/api/reports/financial?from=2026-04-01&to=2026-04-30&basis=cash&columns=month') as {profitLoss:{revenue:string;expenses:string;netIncome:string}};
 expect(report.profitLoss).toMatchObject({revenue:'500.00',expenses:'200.00',netIncome:'300.00'});
 const derived=await request('/api/reports/general-ledger?from=2026-04-01&to=2026-04-30&basis=cash') as {meta:{cashRecognition:string};lines:{sourceJournalEntryId?:string;sourceEntryNumber?:string}[]};expect(derived.meta.cashRecognition).toBe('settled-source-components-v1');expect(derived.lines.some(line=>line.sourceJournalEntryId&&line.sourceEntryNumber)).toBe(true);
 const after=await request('/api/reports/general-ledger?from=2026-04-01&to=2026-04-30&basis=accrual') as {lines:unknown[]};expect(after.lines).toEqual(before.lines);
}));
