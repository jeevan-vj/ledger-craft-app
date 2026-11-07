import { Hono } from 'hono';
import { bulkStatementRequestSchema, customerStatementQuerySchema } from '@ledgercraft/contracts';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { createUnavailableInvoiceMailer, type InvoiceMailer } from '../invoices/mailer';
import { parseIdempotencyKey } from '../invoices/idempotency';
import { customerStatementForUser } from './customer-statements.service';
import { sendBulkStatementsForUser,createStatementShareForUser, publicStatement, revokeStatementSharesForUser, sendStatementForUser } from './customer-statements.delivery';
export function statementRoutes(options: {
    mailer?: InvoiceMailer;
    appUrl?: string;
} = {}) {
    const r = new Hono<AppEnv>();
    const mailer = options.mailer ?? createUnavailableInvoiceMailer(), appUrl = options.appUrl ?? 'http://localhost:8080';
    for (const prefix of ['', '/api']) {
        r.get(`${prefix}/customers/:id/statement`, async (c) => { const { db, user } = await requireSession(c); return c.json(await customerStatementForUser(db, user.id, c.req.param('id'), customerStatementQuerySchema.parse(c.req.query()))); });
        r.post(`${prefix}/customers/:id/statement/share`, async (c) => { const { db, user } = await requireSession(c); return c.json(await createStatementShareForUser(db, user.id, c.req.param('id'), customerStatementQuerySchema.parse(await c.req.json()), appUrl), 201); });
        r.delete(`${prefix}/customers/:id/statement/shares`, async (c) => { const { db, user } = await requireSession(c); return c.json(await revokeStatementSharesForUser(db, user.id, c.req.param('id'))); });
        r.post(`${prefix}/customers/:id/statement/send`, async (c) => { const { db, user } = await requireSession(c); return c.json(await sendStatementForUser(db, user.id, c.req.param('id'), customerStatementQuerySchema.parse(await c.req.json()), mailer, appUrl, parseIdempotencyKey(c.req.header('Idempotency-Key')))); });
        r.post(`${prefix}/customer-statements/send-bulk`,async c=>{const {db,user}=await requireSession(c);return c.json(await sendBulkStatementsForUser(db,user.id,bulkStatementRequestSchema.parse(await c.req.json()),mailer,appUrl,parseIdempotencyKey(c.req.header('Idempotency-Key'))));});
    }
    return r;
}
/** Mount separately from authenticated routes; the Worker resolves the token's
 * organisation prefix before forwarding to its Ledger, matching invoice shares. */
export function publicStatementRoutes(db: () => Promise<import('../../db/client').Database>) { const r = new Hono(); for (const prefix of ['', '/api'])
    r.get(`${prefix}/public/customer-statements/:token`, async (c) => c.json(await publicStatement(await db(), c.req.param('token')))); return r; }
