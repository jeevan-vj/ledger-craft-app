import { customerStatementQuerySchema, customerStatementSchema, type CustomerStatementQuery } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { financialReportQuerySchema } from '@ledgercraft/contracts';
import { receivables } from '../reports/reports.repository';
import { buildAging } from '../reports/reports.engine';
import { getBusinessProfile } from '../business-profile/business-profile.repository';
import { statementMovements } from './customer-statements.engine';
import * as repo from './customer-statements.repository';
export async function statementInTx(tx: Database, org: string, id: string, input: CustomerStatementQuery) {
    const query = customerStatementQuerySchema.parse(input), customer = await repo.customer(tx, org, id);
    if (!customer)
        throw new HTTPException(404, { message: 'Customer not found' });
    const [source, documents, profile] = await Promise.all([repo.sourceRows(tx, org, id, query.to), receivables(tx, org, financialReportQuerySchema.parse({ from: query.from, to: query.to, basis: 'accrual', baseCurrency: 'NZD', customerIds: [id] })), getBusinessProfile(tx, org)]);
    const movements = statementMovements(source);
    let running = decimal(0);
    let opening = decimal(0);
    const activity = movements.filter(v => { if (v.date < query.from) {
        opening = opening.add(v.debit).sub(v.credit);
        return false;
    } return true; });
    running = opening;
    const lines: import('@ledgercraft/contracts').CustomerStatement['lines'] = query.type === 'activity' ? activity.map(v => { running = running.add(v.debit).sub(v.credit); return { ...v, runningBalance: roundMoney(running) }; }) : documents.filter(v => decimal(v.balanceDue).compare(0) > 0).map(v => { running = running.add(v.balanceDue); return { id: v.id, date: v.issueDate, kind: 'open_invoice', reference: v.number, description: `Outstanding invoice ${v.number}`, debit: roundMoney(v.balanceDue), credit: '0.00', runningBalance: '0.00', invoiceId: v.id }; });
    const closing = movements.reduce((s, v) => s.add(v.debit).sub(v.credit), decimal(0));
    if (query.type === 'open_items') {
        running = decimal(0);
        for (const row of lines) {
            running = running.add(row.debit).sub(row.credit);
            row.runningBalance = roundMoney(running);
        }
        const remainder = closing.sub(running);
        if (remainder.compare(0) !== 0) {
            running = running.add(remainder);
            lines.push({ id: 'unallocated-credit', date: query.to, kind: 'customer_credit', reference: 'Customer credit', description: 'Retained unapplied customer credit / control movements', debit: remainder.compare(0) > 0 ? roundMoney(remainder) : '0.00', credit: remainder.compare(0) < 0 ? roundMoney(remainder.abs()) : '0.00', runningBalance: roundMoney(running) });
        }
    }
    return customerStatementSchema.parse({ customer: { id: customer.id, name: customer.name, email: customer.email }, businessName: profile?.name ?? 'Your business', currency: 'NZD', ...query, openingBalance: query.type === 'activity' ? roundMoney(opening) : '0.00', lines, closingBalance: roundMoney(closing), aging: buildAging(documents, query.to, closing), generatedAt: new Date().toISOString(), warnings: ['Amounts are company-base NZD from posted receivable and customer-credit journals. Foreign invoices use recorded carrying amounts.', 'Customer credits are shown separately from invoice aging; confirm any unallocated balance before collection.'] });
}
export async function customerStatementForUser(db: Database, userId: string, id: string, query: CustomerStatementQuery) { return withOrganisationTx(db, userId, (tx, ctx) => statementInTx(tx, ctx.organisationId, id, query)); }
