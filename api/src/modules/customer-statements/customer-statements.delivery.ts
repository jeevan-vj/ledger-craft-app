import type { CustomerStatementQuery } from '@ledgercraft/contracts';
import { bulkStatementRequestSchema,customerStatementSchema } from '@ledgercraft/contracts';
import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { organisations } from '../../db/schema/identity';
import { withOrganisationTx } from '../auth/bind-organisation';
import type { InvoiceMailer } from '../invoices/mailer';
import { decimal } from '../invoices/money';
import { statementInTx,customerStatementForUser } from './customer-statements.service';
import * as repo from './customer-statements.repository';
import { claimStatementDelivery, finishStatementDelivery } from './statement-delivery-idempotency';
const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
async function prepareShareForUser(db: Database, userId: string, id: string, query: CustomerStatementQuery, appUrl: string) {
    return withOrganisationTx(db, userId, async (tx, ctx) => {
        if (!['owner', 'admin', 'accountant'].includes(ctx.role))
            throw new HTTPException(403, { message: 'An owner, administrator or accountant must share customer statements' });
        const snapshot = await statementInTx(tx, ctx.organisationId, id, query);
        const token = `${ctx.organisationId}.${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
        const expiresAt = new Date(Date.now() + 7 * 86400000);
        await repo.saveShare(tx, { organisationId: ctx.organisationId, customerId: id, tokenHash: await digest(token), snapshot, expiresAt });
        return { snapshot,share:{ token, url: `${appUrl.replace(/\/$/, '')}/shared/statement/${token}`, expiresAt: expiresAt.toISOString() } };
    });
}
export async function createStatementShareForUser(db: Database,userId:string,id:string,query:CustomerStatementQuery,appUrl:string){return (await prepareShareForUser(db,userId,id,query,appUrl)).share;}
export async function publicStatement(db: Database, token: string) { if (!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token))
    throw new HTTPException(404, { message: 'Statement is unavailable' }); const row = await repo.shareByHash(db, await digest(token)); const [org] = row ? await db.select({ id: organisations.id }).from(organisations).where(and(eq(organisations.id, row.organisationId), isNull(organisations.archivedAt))) : []; if (!row || !org || row.revokedAt || row.expiresAt <= new Date())
    throw new HTTPException(404, { message: 'Statement is unavailable' }); return customerStatementSchema.parse(row.snapshot); }
export async function revokeStatementSharesForUser(db: Database, userId: string, id: string) { return withOrganisationTx(db, userId, async (tx, ctx) => { if (!['owner', 'admin', 'accountant'].includes(ctx.role))
    throw new HTTPException(403, { message: 'An owner, administrator or accountant must share customer statements' }); if (!await repo.customer(tx, ctx.organisationId, id))
    throw new HTTPException(404, { message: 'Customer not found' }); await repo.revokeShares(tx, ctx.organisationId, id); return { revoked: true }; }); }
export async function sendStatementForUser(db: Database, userId: string, id: string, query: CustomerStatementQuery, mailer: InvoiceMailer, appUrl: string, deliveryKey?: string) {
    if (mailer.availability !== 'available' || !mailer.sendStatement)
        throw new HTTPException(503, { message: 'Email unavailable. Share the statement link or download its PDF instead.' });
    const claim = await claimStatementDelivery(db, userId, id, deliveryKey, query);
    if (!claim.claimed)
        return claim.response;
    try {
        const {share,snapshot:value}=await prepareShareForUser(db,userId,id,query,appUrl);
        if (!value.customer.email.trim()) throw new HTTPException(422,{message:'Add the customer email before sending a statement'});
        await mailer.sendStatement({ invoiceId: id, invoiceNumber: `${query.from} to ${query.to}`, to: [value.customer.email], amountDue: value.closingBalance, currency: 'NZD', businessName: value.businessName, publicUrl: share.url, deliveryKey: deliveryKey ? `statement/${await digest(id + '/' + deliveryKey)}` : `statement/${share.token}`, message: 'Review your customer statement using the secure link below. This snapshot expires in seven days.' });
        const response = { sent: true, ...share };
        await finishStatementDelivery(db, claim, 200, response);
        return response;
    }
    catch (error) {
        await finishStatementDelivery(db, claim, 502, { sent: false });
        throw error;
    }
}

export async function sendBulkStatementsForUser(db:Database,userId:string,input:unknown,mailer:InvoiceMailer,appUrl:string,key?:string){
 const request=bulkStatementRequestSchema.parse(input);
 const claim=await claimStatementDelivery(db,userId,'bulk',key,request);if(!claim.claimed)return claim.response;
 const results=[];
 for(const id of new Set(request.customerIds)){
  try{
   const statement=await customerStatementForUser(db,userId,id,request);
   if(decimal(statement.closingBalance).compare(0)===0){results.push({customerId:id,status:'skipped',reason:'zero_balance'});continue;}
   await sendStatementForUser(db,userId,id,request,mailer,appUrl,key?await digest(`bulk/${key}/${id}`):undefined);results.push({customerId:id,status:'sent'});
  }catch{results.push({customerId:id,status:'failed',reason:'statement_send_failed'});}
 }
 const response={sent:results.filter(v=>v.status==='sent').length,failed:results.filter(v=>v.status==='failed').length,skipped:results.filter(v=>v.status==='skipped').length,results};
 await finishStatementDelivery(db,claim,200,response);return response;
}
